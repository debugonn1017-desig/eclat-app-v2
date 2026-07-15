-- ============================================================
-- v0.3.51-hotfix3-P1: キャスト名まわりの DB オブジェクト最終確定
-- ============================================================
-- 背景 (Codex 4回目レビュー P1):
--   20260715_* の4ファイルはファイル名順が作成順と一致しないため、
--   まっさらな環境で順に適用すると
--     20260715_cast_name_guard_v2.sql (hotfix3: 門番v2)
--       ↓ その後に
--     20260715_customers_cast_name_guard.sql (hotfix2: 門番v1)
--   の順で実行され、customers 門番が古い v1 定義に戻ってしまう。
--
--   適用済みファイルは変更しない方針のため、並び順で必ず最後になる
--   本ファイルで「この時点の最終確定状態」を再適用する (forward-only)。
--   すべて再実行安全 (create or replace + drop/create trigger)。
--   本番 (手動実行で既に最終状態) に流しても定義は変わらない。
--
-- 最終確定状態 = 以下の3点:
--   1. admin_rename_cast v3 (3引数, customers→profiles ロック順, lock_timeout 3s)
--   2. profiles_cast_name_guard (cast_name 変更は service_role / postgres のみ)
--   3. customers_cast_name_guard v2 (全UPDATE発火 + 変更時のみ btrim 正規化 + 実在チェック)
--
-- ⚠ 今後のルール: 同じ日に複数マイグレーションを作る場合、
--   ファイル名順 = 適用順 になるよう連番等で一意な後続名を付けること
--   (例: 20260716_a_xxx.sql, 20260716_b_yyy.sql)。
--   関数・トリガーの定義変更は、必ず「並び順で最後になる新ファイル」で行う。

-- ── 1. admin_rename_cast v3 (最終) ─────────────────────────

drop function if exists public.admin_rename_cast(uuid, text);

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

  -- ロック待ちの上限 (このトランザクション内のみ有効)
  perform set_config('lock_timeout', '3s', true);

  -- ロック順ルール: customers (テーブル) → profiles (行)。今後もこの順を厳守
  lock table public.customers in exclusive mode;

  select p.cast_name into v_old_name
  from public.profiles p
  where p.id = p_cast_id
    and p.role = 'cast'
  for update;

  if not found then
    raise exception 'CAST_NOT_FOUND' using errcode = 'P0002'; -- no_data_found
  end if;

  update public.profiles
  set cast_name    = v_new_name,
      display_name = coalesce(v_display_name, display_name)
  where id = p_cast_id;

  if v_old_name is not null and v_old_name <> v_new_name then
    update public.customers
    set cast_name = v_new_name
    where cast_name = v_old_name;
    get diagnostics v_count = row_count;
  end if;

  return query select v_old_name, v_count;
end;
$$;

revoke all on function public.admin_rename_cast(uuid, text, text) from public;
revoke all on function public.admin_rename_cast(uuid, text, text) from anon;
revoke all on function public.admin_rename_cast(uuid, text, text) from authenticated;
grant execute on function public.admin_rename_cast(uuid, text, text) to service_role;

-- ── 2. profiles_cast_name_guard (最終) ─────────────────────

create or replace function public.profiles_cast_name_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cast_name is distinct from old.cast_name
     and current_user not in ('service_role', 'postgres')
  then
    raise exception 'CAST_NAME_DIRECT_UPDATE_FORBIDDEN'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_cast_name_guard on public.profiles;
create trigger profiles_cast_name_guard
  before update on public.profiles
  for each row
  execute function public.profiles_cast_name_guard();

-- ── 3. customers_cast_name_guard v2 (最終) ─────────────────

create or replace function public.customers_cast_name_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- cast_name を触っていない UPDATE は何もしない (正規化もしない: 既存データ不変)
  if tg_op = 'UPDATE' and new.cast_name is not distinct from old.cast_name then
    return new;
  end if;

  -- 空白の正規化: trim して空白のみは '' に揃える
  if new.cast_name is not null then
    new.cast_name := btrim(new.cast_name);
  end if;

  -- 担当なし (NULL / 空文字) は許可 (仮登録・担当未定)
  if new.cast_name is null or new.cast_name = '' then
    return new;
  end if;

  -- 正規化の結果、実質変更なしになった UPDATE はスキップ
  if tg_op = 'UPDATE' and new.cast_name is not distinct from old.cast_name then
    return new;
  end if;

  -- 実在チェック (書き込みと同一トランザクション内 = TOCTOU なし)。
  -- is_active は意図的に見ない (退店キャストへの割当ても運用上許可 = 2026-07-15 オーナー判断)
  if not exists (
    select 1
    from public.profiles p
    where p.role = 'cast'
      and p.cast_name = new.cast_name
  ) then
    raise exception 'CAST_NAME_NOT_FOUND: %', new.cast_name
      using errcode = '23503'; -- foreign_key_violation 相当
  end if;

  return new;
end;
$$;

drop trigger if exists customers_cast_name_guard on public.customers;
create trigger customers_cast_name_guard
  before insert or update on public.customers
  for each row
  execute function public.customers_cast_name_guard();
