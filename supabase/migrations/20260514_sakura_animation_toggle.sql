-- ═══════════════════════════════════════════════════════════════════
--  桜アニメ ON/OFF 切替フラグ (F-2 リブランド対応 / 2026-05-14)
-- ═══════════════════════════════════════════════════════════════════
--
--  目的:
--    桜の花びらアニメーションをグローバルにON/OFF切替できるようにする
--
--  方針:
--    1. app_settings テーブルに sakura_animation_enabled (boolean) を追加
--       - デフォルト true (ON)
--       - 重い兆候があれば管理者が即OFFできる
--    2. ユーザー個別設定は localStorage 側で持つ (本マイグレーションは触らない)
--       - 個別ユーザーの「アニメ切る」要望に対応
--       - キー: 'eclat.sakuraAnimation' = 'on' | 'off'
--    3. 適用優先順位:
--       (A) 個別 localStorage が 'off' → OFF (最優先)
--       (B) app_settings.sakura_animation_enabled = false → OFF
--       (C) それ以外 → ON
--
--  適用: Supabase ダッシュボード → SQL Editor → 全文貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① app_settings に sakura_animation_enabled カラム追加 ────────
alter table public.app_settings
  add column if not exists sakura_animation_enabled boolean not null default true;

comment on column public.app_settings.sakura_animation_enabled is
  '桜アニメをグローバル ON/OFF (false で全ユーザー一律 OFF)';

-- ─── ② 既存レコードに対する初期値の補填 ──────────────────────
-- app_settings は通常 1 行のみ運用なので、念のため UPDATE で確実に true をセット
update public.app_settings
  set sakura_animation_enabled = true
  where sakura_animation_enabled is null;

-- ─── ③ 検証クエリ ──────────────────────────────────────────
-- select sakura_animation_enabled from public.app_settings;
-- select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'app_settings' and column_name = 'sakura_animation_enabled';

-- ═══════════════════════════════════════════════════════════════════
--  ロールバック SQL (必要な場合のみ)
-- ═══════════════════════════════════════════════════════════════════
--
-- alter table public.app_settings
--   drop column if exists sakura_animation_enabled;
