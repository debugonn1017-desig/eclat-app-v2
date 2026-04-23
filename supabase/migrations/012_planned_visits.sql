-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 来店予定管理 (Phase 12)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.planned_visits (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cast_id     uuid   NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  planned_date date  NOT NULL,
  planned_time text,            -- 来店予定時間（任意）例: "20:00"
  party_size   int,             -- 来店人数（任意）
  has_douhan   boolean,         -- 同伴有無（任意）
  memo         text,            -- メモ（任意）
  status       text NOT NULL DEFAULT '予定'
               CHECK (status IN ('予定', '来店済み', 'キャンセル')),
  visit_id     bigint REFERENCES public.customer_visits(id), -- 来店済み時にリンク
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_planned_visits_customer
  ON public.planned_visits(customer_id);
CREATE INDEX IF NOT EXISTS idx_planned_visits_cast
  ON public.planned_visits(cast_id);
CREATE INDEX IF NOT EXISTS idx_planned_visits_date
  ON public.planned_visits(planned_date);
CREATE INDEX IF NOT EXISTS idx_planned_visits_status
  ON public.planned_visits(status);

-- RLS
ALTER TABLE public.planned_visits ENABLE ROW LEVEL SECURITY;

-- 管理者は全操作可能
CREATE POLICY "planned_visits_admin_all"
  ON public.planned_visits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- キャストは自分の来店予定のみ閲覧・操作可能
CREATE POLICY "planned_visits_cast_own"
  ON public.planned_visits FOR ALL
  USING (cast_id = auth.uid());
