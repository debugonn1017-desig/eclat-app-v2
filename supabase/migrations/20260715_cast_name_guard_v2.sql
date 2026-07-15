-- ============================================================
-- v0.3.51-hotfix3: profiles 側の門番 + customers 門番 v2
-- ============================================================
-- Codex 3回目レビューの対応。
--
-- ① profiles_cast_name_guard (指摘1: 重要)
--    既存 RLS は active な admin 全員に profiles の直接 UPDATE を許可しているため、
--    ブラウザの Supabase クライアントから cast_name だけを書き換えると
--    (顧客側の一斉更新を伴う) 正規ルートを迂回できてしまう。
--    → cast_name の変更は service_role (= PATCH /api/admin/casts/[id] → admin_rename_cast)
--      と postgres (SQL Editor での手動修正) のみに制限する。
--    cast_name を変更しない UPDATE (display_name / cast_tier / is_active 等) は従来どおり。

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
      -- キャスト名の変更は管理画面の「名前変更」(admin_rename_cast 経由) から行うこと
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_cast_name_guard on public.profiles;
create trigger profiles_cast_name_guard
  before update on public.profiles
  for each row
  execute function public.profiles_cast_name_guard();

-- ② customers_cast_name_guard v2 (指摘3 + 助言)
--    変更点 (v1 → v2):
--    - UPDATE OF cast_name 限定をやめ、UPDATE 全体で発火して関数内で変更判定
--      (将来、別の BEFORE トリガーが NEW.cast_name を書き換えても検知できる。
--       未変更時は先頭で即 return するため実質コストなし)
--    - 空白の正規化を DB 側でも実施 (直接書き込みで " " が保存されるのを防ぐ)。
--      ただし cast_name を実際に変更するときだけ (過去データを勝手に書き換えない)
--    - 実在チェックは is_active を見ない (退店キャストへの割当ても運用上許可
--      = 復帰予定の子への事前紐づけ等がある。2026-07-15 拓馬さん判断)

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

  -- 実在チェック (書き込みと同一トランザクション内 = TOCTOU なし)
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
