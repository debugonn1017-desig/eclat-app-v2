-- ============================================================
-- v0.3.51-hotfix2: customers.cast_name 門番トリガー + admin_rename_cast v3
-- ============================================================
-- Codex 2回目レビューの指摘1 (実在チェックと書き込みが別トランザクション =
-- TOCTOU 競合が残る) への根本対応。
--
-- ① 門番トリガー customers_cast_name_guard
--    customers への INSERT / cast_name を変更する UPDATE 時に、
--    担当キャスト名が profiles に実在するかを【書き込みと同一トランザクション内】で検証。
--    - API の事前チェックでは「チェック後〜保存前」にリネームされる隙間が残る
--    - 顧客引継ぎ等のクライアント直接書き込みは API チェックを素通りする
--    → DB 層を最終防衛線にすることで、どの経路でも旧名の書き戻しが不可能になる
--    許可されるもの:
--    - NULL / 空文字 / 空白のみ (担当未定の仮登録。従来どおり)
--    - 退店キャスト (is_active=false) の名前 (ソフトデリート設計: 顧客行は旧担当名を保持)
--    - cast_name が変わらない UPDATE (過去データの表記ゆれ行も通常編集できるように)

create or replace function public.customers_cast_name_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cast_name is not null
     and btrim(new.cast_name) <> ''
     and (tg_op = 'INSERT' or new.cast_name is distinct from old.cast_name)
  then
    if not exists (
      select 1
      from public.profiles p
      where p.role = 'cast'
        and p.cast_name = new.cast_name
    ) then
      raise exception 'CAST_NAME_NOT_FOUND: %', new.cast_name
        using errcode = '23503'; -- foreign_key_violation 相当
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists customers_cast_name_guard on public.customers;
create trigger customers_cast_name_guard
  before insert or update of cast_name on public.customers
  for each row
  execute function public.customers_cast_name_guard();

-- ② admin_rename_cast v3 (Codex 助言反映)
--    v2 からの変更点:
--    - 【ロック順ルール】customers (テーブルロック) → profiles (行ロック) の順に固定。
--      今後 customers → profiles行ロック の順で書く処理を追加する場合もこの順を守ること
--      (逆順が混在するとデッドロックの温床になる)
--    - lock_timeout 3秒 (このトランザクション内のみ): 混雑時に無限に待たず
--      55P03 エラーで返す。API 側で「もう一度お試しください」に変換

create or replace function public.admin_rename_cast(
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

  -- ロック待ちの上限 (この呼び出しのトランザクション内のみ有効)
  perform set_config('lock_timeout', '3s', true);

  -- ロック順 1/2: customers テーブルロック (リネーム中の旧名滑り込みを遮断。SELECT は非阻害)
  lock table public.customers in exclusive mode;

  -- ロック順 2/2: 対象キャストの行ロック (同じキャストへの同時リネームを直列化)
  select p.cast_name into v_old_name
  from public.profiles p
  where p.id = p_cast_id
    and p.role = 'cast'
  for update;

  if not found then
    raise exception 'CAST_NOT_FOUND' using errcode = 'P0002'; -- no_data_found
  end if;

  -- ① キャスト台帳の名前 (+ 表示名) を更新
  --    (重複名は profiles_cast_name_unique の 23505 で全体ロールバック)
  update public.profiles
  set cast_name    = v_new_name,
      display_name = coalesce(v_display_name, display_name)
  where id = p_cast_id;

  -- ② 旧名で紐づいていた担当顧客の cast_name を一斉更新
  --    (customers_cast_name_guard トリガーが発火するが、新名は同一トランザクション内で
  --     profiles に反映済みのため通過する)
  if v_old_name is not null and v_old_name <> v_new_name then
    update public.customers
    set cast_name = v_new_name
    where cast_name = v_old_name;
    get diagnostics v_count = row_count;
  end if;

  return query select v_old_name, v_count;
end;
$$;

-- service_role (API サーバー) 以外からの呼び出しを禁止 (v2 と同じ。念のため再付与)
revoke all on function public.admin_rename_cast(uuid, text, text) from public;
revoke all on function public.admin_rename_cast(uuid, text, text) from anon;
revoke all on function public.admin_rename_cast(uuid, text, text) from authenticated;
grant execute on function public.admin_rename_cast(uuid, text, text) to service_role;
