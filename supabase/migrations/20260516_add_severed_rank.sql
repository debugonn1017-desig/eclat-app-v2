-- ─────────────────────────────────────────────────────────────────
--  顧客ランクに「切れた」を追加 (v0.3.1, 2026-05-16)
--
--  「切れた」は連絡が切れた / 離脱したお客様用の手動専用ランク。
--  自動ランク変動の対象外で、手動で別ランクに戻すまで '切れた' を維持する。
--
--  既存 CHECK 制約は存在しないので IF EXISTS で安全に落とすだけ。
--  新しい CHECK 制約 customers_customer_rank_check を付与する。
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_customer_rank_check;

ALTER TABLE customers
  ADD CONSTRAINT customers_customer_rank_check
  CHECK (
    customer_rank IS NULL
    OR customer_rank IN ('S', 'A', 'B', 'C', '切れた')
  );

-- 念のためコメントを残す
COMMENT ON COLUMN customers.customer_rank IS
  '顧客ランク。S/A/B/C は自動判定対象。「切れた」は連絡が切れたお客様用の手動専用ランク（自動変動の対象外）。NULL は未設定。';
