-- v0.3.22 (2026-05-20)
-- customers に phase_shoshimei_at カラム追加。
-- 「関係性（phase）を初指名として保存した最新の日時」を保持する。
-- NEW バッジの判定条件③で使用:
--   phase_shoshimei_at が 90 日以内 → 現在の関係性が別でも NEW バッジを表示
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS phase_shoshimei_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN customers.phase_shoshimei_at IS
  'phase を初指名に設定した最新の日時。NEW バッジの90日判定で使用。';

-- 既存顧客で現在の phase='初指名' のものは、過去の保存日が分からないので
-- created_at をセットしておく（過去の登録分の保険、初回適用時のみ）。
UPDATE customers
  SET phase_shoshimei_at = COALESCE(created_at, NOW())
  WHERE phase = '初指名' AND phase_shoshimei_at IS NULL;
