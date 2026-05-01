-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — cast_extension_sales にお連れ様カラムを追加
-- ═══════════════════════════════════════════════════════════════════════
--  顧客の来店記録 (customer_visits) と同じく、場内延長にも
--  「お連れ様の本指名キャスト名 / 場内キャスト名」を残せるようにする。
-- ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.cast_extension_sales
  ADD COLUMN IF NOT EXISTS companion_honshimei text DEFAULT '';

ALTER TABLE public.cast_extension_sales
  ADD COLUMN IF NOT EXISTS companion_banai text DEFAULT '';

-- 完了チェック
SELECT 'companion_honshimei' AS column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cast_extension_sales'
      AND column_name = 'companion_honshimei'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'companion_banai',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cast_extension_sales'
      AND column_name = 'companion_banai'
  ) THEN 'OK' ELSE 'MISSING' END;
