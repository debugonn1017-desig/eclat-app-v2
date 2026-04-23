-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 来店記録の項目拡張 (Phase 6)
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS party_size int NOT NULL DEFAULT 1;

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS has_douhan boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS has_after boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS is_planned boolean NOT NULL DEFAULT false;

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS companion_honshimei text DEFAULT '';

ALTER TABLE public.customer_visits
  ADD COLUMN IF NOT EXISTS companion_banai text DEFAULT '';

-- 完了チェック
SELECT 'party_size' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_visits' AND column_name = 'party_size'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'has_douhan',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_visits' AND column_name = 'has_douhan'
  ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'has_after',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_visits' AND column_name = 'has_after'
  ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'is_planned',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_visits' AND column_name = 'is_planned'
  ) THEN 'OK' ELSE 'MISSING' END;
