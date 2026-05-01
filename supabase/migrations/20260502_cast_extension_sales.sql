-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 場内延長売上テーブル
-- ═══════════════════════════════════════════════════════════════════════
--  目的:
--    customer_visits は「特定の顧客の来店」を記録するテーブル。
--    一方「場内延長」は、場内（指名なし）でついていた席が延長して
--    売上が立ったケースで、特定の顧客に紐づかない。
--    KPI上は「指名顧客の客単価」と混ざらないよう、別テーブルで管理する。
-- ───────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cast_extension_sales (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cast_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sale_date       date        NOT NULL,
  amount_spent    integer     NOT NULL DEFAULT 0,
  party_size      integer     NOT NULL DEFAULT 1,
  table_number    text        DEFAULT '',
  has_douhan      boolean     NOT NULL DEFAULT false,
  has_after       boolean     NOT NULL DEFAULT false,
  memo            text        DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 月次集計を高速化するためのインデックス
CREATE INDEX IF NOT EXISTS idx_cast_extension_sales_cast_date
  ON public.cast_extension_sales (cast_id, sale_date);

-- updated_at の自動更新トリガ
CREATE OR REPLACE FUNCTION public.set_updated_at_cast_extension_sales()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cast_extension_sales_updated_at
  ON public.cast_extension_sales;
CREATE TRIGGER trg_cast_extension_sales_updated_at
  BEFORE UPDATE ON public.cast_extension_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cast_extension_sales();

-- ─────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.cast_extension_sales ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件 R/W
DROP POLICY IF EXISTS "cast_extension_sales_admin_all"
  ON public.cast_extension_sales;
CREATE POLICY "cast_extension_sales_admin_all"
  ON public.cast_extension_sales FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分の場内延長レコードのみ閲覧可（書き込みは不可）
DROP POLICY IF EXISTS "cast_extension_sales_cast_read_self"
  ON public.cast_extension_sales;
CREATE POLICY "cast_extension_sales_cast_read_self"
  ON public.cast_extension_sales FOR SELECT
  USING (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────
-- 完了チェック
-- ─────────────────────────────────────────────────────────────────────
SELECT 'cast_extension_sales' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'cast_extension_sales'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'idx_cast_extension_sales_cast_date',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_cast_extension_sales_cast_date'
  ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'rls_enabled',
  CASE WHEN (
    SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.cast_extension_sales'::regclass
  ) THEN 'OK' ELSE 'MISSING' END;
