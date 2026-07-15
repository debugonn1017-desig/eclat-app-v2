-- ============================================================
-- v0.3.51-hotfix: admin_rename_cast v2 (Codex レビュー反映)
-- ============================================================
-- v1 (20260715_admin_rename_cast.sql) からの変更点:
--   1. customers テーブルを EXCLUSIVE ロック
--      → リネーム中に別トランザクションが旧名で顧客を追加/更新して
--        UPDATE のスナップショットから漏れる競合ウィンドウを閉じる。
--        EXCLUSIVE は読み取り (SELECT) を妨げない。リネームはミリ秒で完了する想定
--   2. p_display_name 引数を追加
--      → cast_name と display_name (表示名) を同一トランザクションで更新。
--        NULL / 空文字 = 表示名は変更しない
--   3. CAST_NOT_FOUND に SQLSTATE 'P0002' (no_data_found) を設定
--      → API 側で message 文字列でなく err.code で判定できるように
--   4. security definer を撤去
--      → 呼び出しは service_role のみ (RLS 迂回可能) なので definer は不要な権限昇格
--   5. search_path = '' + テーブルは完全修飾 (シャドーイング防止)
--
-- ※ 引数が2つ→3つに変わるため、旧シグネチャの関数は drop してから作り直す
--    (create or replace では引数追加できず、別関数として重複登録されてしまう)

drop function if exists public.admin_rename_cast(uuid, text);

create function public.admin_rename_cast(
  p_cast_id uuid,
  p_new_name text,
  p_display_name text default null
)
returns table (old_name text, updated_customers integer)
language plpgsql
set search_path = ''
as $$
declare
  v_old_name     text;
  v_new_name     text := trim(p_new_name);
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_count        integer := 0;
begin
  if v_new_name is null or v_new_name = '' then
    raise exception 'INVALID_NAME' using errcode = '22023'; -- invalid_parameter_value
  end if;

  -- 対象キャストを行ロック (同じキャストへの同時リネームを直列化)
  select p.cast_name into v_old_name
  from public.profiles p
  where p.id = p_cast_id
    and p.role = 'cast'
  for update;

  if not found then
    raise exception 'CAST_NOT_FOUND' using errcode = 'P0002'; -- no_data_found
  end if;

  -- リネーム中の customers への同時書き込み (旧名の滑り込み) を遮断
  lock table public.customers in exclusive mode;

  -- ① キャスト台帳の名前を更新
  --    (重複名は profiles_cast_name_unique の 23505 で全体ロールバック)
  update public.profiles
  set cast_name    = v_new_name,
      display_name = coalesce(v_display_name, display_name)
  where id = p_cast_id;

  -- ② 旧名で紐づいていた担当顧客の cast_name を一斉更新
  if v_old_name is not null and v_old_name <> v_new_name then
    update public.customers
    set cast_name = v_new_name
    where cast_name = v_old_name;
    get diagnostics v_count = row_count;
  end if;

  return query select v_old_name, v_count;
end;
$$;

-- service_role (API サーバー) 以外からの呼び出しを禁止
revoke all on function public.admin_rename_cast(uuid, text, text) from public;
revoke all on function public.admin_rename_cast(uuid, text, text) from anon;
revoke all on function public.admin_rename_cast(uuid, text, text) from authenticated;
grant execute on function public.admin_rename_cast(uuid, text, text) to service_role;
