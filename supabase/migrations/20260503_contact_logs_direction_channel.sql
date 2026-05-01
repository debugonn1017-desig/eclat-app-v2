-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 連絡履歴ログ拡張: 方向(direction) と チャネル(channel) を追加
-- ═══════════════════════════════════════════════════════════════════════
--  顧客との連絡を「送った/もらった」「LINE/電話/来店中/その他」で
--  記録できるようにする。既存レコードはデフォルト 'sent' / 'LINE' とみなす。
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'sent';

-- 'sent' = キャストから送った / 'received' = お客様から受信
ALTER TABLE public.customer_contacts
  ADD CONSTRAINT customer_contacts_direction_check
    CHECK (direction IN ('sent', 'received'));

ALTER TABLE public.customer_contacts
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'LINE';

-- LINE / 電話 / メール / 来店中 / その他
ALTER TABLE public.customer_contacts
  ADD CONSTRAINT customer_contacts_channel_check
    CHECK (channel IN ('LINE', '電話', 'メール', '来店中', 'その他'));

-- 完了チェック
SELECT 'direction' AS column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_contacts'
      AND column_name = 'direction'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'channel',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customer_contacts'
      AND column_name = 'channel'
  ) THEN 'OK' ELSE 'MISSING' END;
