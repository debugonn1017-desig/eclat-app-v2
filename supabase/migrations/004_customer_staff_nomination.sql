-- お客様担当フラグ & 指名状況 追加
-- 2026-04-21

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS has_customer_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nomination_status text NOT NULL DEFAULT 'フリー';
