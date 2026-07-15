-- ============================================================
-- v0.3.51: キャスト名 (源氏名) 変更を1トランザクションで行う DB 関数
-- ============================================================
-- 背景:
--   顧客 (customers) は担当キャストと「cast_name (文字列)」で紐づいている。
--   profiles.cast_name だけを変更すると、
--     - 担当顧客が集計 (KPI / ランキング / ホーム) から消える
--     - RLS (customers.cast_name = current_cast_name()) が不一致になり、
--       キャスト本人が自分の担当顧客を1人も見られなくなる
--   ため、profiles と customers は必ずセットで更新する必要がある。
--
-- この関数は「① profiles.cast_name 更新」「② customers.cast_name 一斉更新」を
-- 1つのトランザクション内で実行する。どちらかが失敗した場合は両方ロールバック
-- され、中途半端な状態 (担当が切れた顧客) は構造上残らない。
--
-- 発生し得るエラー:
--   - 23505 (unique_violation): 新名が既存キャストと重複
--       → profiles_cast_name_unique (001_auth_setup.sql) が弾く。全体ロールバック
--   - CAST_NOT_FOUND: 対象 id が存在しない or role が 'cast' でない
--   - INVALID_NAME: 新名が空
--
-- 呼び出し元: PATCH /api/admin/casts/[id] (service_role のみ)。
-- クライアントからの直接 RPC は revoke で遮断する。

create or replace function public.admin_rename_cast(
  p_cast_id uuid,
  p_new_name text
)
returns table (old_name text, updated_customers integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_name text;
  v_new_name text := trim(p_new_name);
  v_count    integer := 0;
begin
  if v_new_name is null or v_new_name = '' then
    raise exception 'INVALID_NAME';
  end if;

  -- 対象キャストを行ロック (同じキャストへの同時リネームを直列化)
  select p.cast_name into v_old_name
  from public.profiles p
  where p.id = p_cast_id
    and p.role = 'cast'
  for update;

  if not found then
    raise exception 'CAST_NOT_FOUND';
  end if;

  -- ① キャスト台帳の名前を更新
  --    (重複名はここで unique 制約 23505 が発生し、トランザクション全体が戻る)
  update public.profiles
  set cast_name = v_new_name
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

-- service_role (API サーバー) 以外からの呼び出しを禁止。
-- security definer 関数はデフォルトで public に execute が付くため、明示的に剥がす。
revoke all on function public.admin_rename_cast(uuid, text) from public;
revoke all on function public.admin_rename_cast(uuid, text) from anon;
revoke all on function public.admin_rename_cast(uuid, text) from authenticated;
grant execute on function public.admin_rename_cast(uuid, text) to service_role;
