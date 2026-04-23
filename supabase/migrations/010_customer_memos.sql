-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 顧客メモタイムライン (Phase 10)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.customer_memos (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  memo_date  date NOT NULL DEFAULT CURRENT_DATE,
  category   text NOT NULL DEFAULT 'メモ',
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_customer_memos_customer_id
  ON public.customer_memos(customer_id);

-- RLS
ALTER TABLE public.customer_memos ENABLE ROW LEVEL SECURITY;

-- 管理者は全件操作可
CREATE POLICY "memos_admin_all"
  ON public.customer_memos FOR ALL
  USING (public.current_role() = 'admin');

-- キャストは自分の顧客のメモのみ
CREATE POLICY "memos_cast_all"
  ON public.customer_memos FOR ALL
  USING (
    public.current_role() = 'cast'
    AND customer_id IN (
      SELECT id FROM public.customers
      WHERE cast_name = (
        SELECT display_name FROM public.profiles
        WHERE id = auth.uid()
      )
    )
  );
