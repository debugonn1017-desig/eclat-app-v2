-- ═══════════════════════════════════════════════════════════════════
--  リブランド対応マイグレーション (F-2 / 2026-05-14)
-- ═══════════════════════════════════════════════════════════════════
--
--  目的:
--    1. profiles.cast_tier の CHECK 制約に「その他」追加
--    2. cast_tier_targets.tier の CHECK 制約に「その他」追加 (層別ノルマも対応)
--    3. cast_targets / rank_criteria は cast_tier に直接依存しないため対象外
--
--  方針:
--    - すべて追加のみ。既存データは触らない (NULL 許容のまま)
--    - ロールバック SQL を末尾コメントに用意
--
--  適用: Supabase ダッシュボード → SQL Editor → 全文貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① profiles.cast_tier に「その他」を追加 ─────────────────
alter table public.profiles
  drop constraint if exists profiles_cast_tier_check;

alter table public.profiles
  add constraint profiles_cast_tier_check
  check (cast_tier is null or cast_tier in (
    'A層', 'B層', '新人層', '無類', 'C層', 'その他'
  ));

-- ─── ② cast_tier_targets.tier にも「その他」を追加 ──────────
alter table public.cast_tier_targets
  drop constraint if exists cast_tier_targets_tier_check;

alter table public.cast_tier_targets
  add constraint cast_tier_targets_tier_check
  check (tier in ('A層', 'B層', '新人層', '無類', 'C層', 'その他'));

-- ─── ③ 検証クエリ ───────────────────────────────────────────
-- 既存データ確認
-- select cast_tier, count(*) from public.profiles
--   where role='cast' and is_active=true group by cast_tier order by cast_tier;
-- select conname, pg_get_constraintdef(c.oid) from pg_constraint c
--   join pg_class t on t.oid=c.conrelid
--   where t.relname in ('profiles','cast_tier_targets') and c.contype='c'
--   order by t.relname, conname;

-- ═══════════════════════════════════════════════════════════════════
--  ロールバック SQL (必要な場合のみ実行 / 「その他」割当のキャストを別層に移動)
-- ═══════════════════════════════════════════════════════════════════
--
-- -- ステップ1: 「その他」割当のレコードを「無類」に移動 (データ消失なし)
-- update public.profiles set cast_tier = '無類'
--   where cast_tier = 'その他';
-- update public.cast_tier_targets set tier = '無類'
--   where tier = 'その他';
--
-- -- ステップ2: CHECK 制約を元の 5 層に戻す
-- alter table public.profiles drop constraint profiles_cast_tier_check;
-- alter table public.profiles add constraint profiles_cast_tier_check
--   check (cast_tier is null or cast_tier in
--     ('A層', 'B層', '新人層', '無類', 'C層'));
--
-- alter table public.cast_tier_targets drop constraint cast_tier_targets_tier_check;
-- alter table public.cast_tier_targets add constraint cast_tier_targets_tier_check
--   check (tier in ('A層', 'B層', '新人層', '無類', 'C層'));
