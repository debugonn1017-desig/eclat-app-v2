-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 指名履歴テーブル & ノルマ拡張 (Phase 5)
-- ═══════════════════════════════════════════════════════════════════════
--
--  Supabase ダッシュボードの「SQL Editor」で実行する。
--  003_cast_management.sql の後に実行すること。
--
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. nomination_history — 指名ステータス変更履歴
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.nomination_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id     uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  cast_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  old_status      text,                               -- 変更前（NULL = 新規登録時）
  new_status      text NOT NULL,                      -- 変更後
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nomination_history_customer
  ON public.nomination_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_nomination_history_cast_date
  ON public.nomination_history(cast_id, changed_at);

ALTER TABLE public.nomination_history ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "nomination_history_admin_all" ON public.nomination_history;
CREATE POLICY "nomination_history_admin_all"
  ON public.nomination_history FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分の履歴のみ読み書き
DROP POLICY IF EXISTS "nomination_history_cast_own" ON public.nomination_history;
CREATE POLICY "nomination_history_cast_own"
  ON public.nomination_history FOR ALL
  USING (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  )
  WITH CHECK (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  );


-- ─────────────────────────────────────────────────────────────────────
-- 2. cast_targets に新カラム追加（既存テーブルを拡張）
-- ─────────────────────────────────────────────────────────────────────

-- 目標本指名数
ALTER TABLE public.cast_targets
  ADD COLUMN IF NOT EXISTS target_honshimei int DEFAULT 0;

-- 目標場内数
ALTER TABLE public.cast_targets
  ADD COLUMN IF NOT EXISTS target_banai int DEFAULT 0;

-- 目標県内（福岡）顧客人数
ALTER TABLE public.cast_targets
  ADD COLUMN IF NOT EXISTS target_local_customers int DEFAULT 0;

-- 目標県外顧客人数
ALTER TABLE public.cast_targets
  ADD COLUMN IF NOT EXISTS target_remote_customers int DEFAULT 0;

-- ランク別目標（JSONB: {"S": {"sales": 100000, "visits": 5}, "A": {...}, ...}）
ALTER TABLE public.cast_targets
  ADD COLUMN IF NOT EXISTS rank_targets jsonb DEFAULT '{}';


-- ─────────────────────────────────────────────────────────────────────
-- 3. 完了チェック
-- ─────────────────────────────────────────────────────────────────────
SELECT 'nomination_history' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'nomination_history'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'target_honshimei column',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cast_targets' AND column_name = 'target_honshimei'
  ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'target_banai column',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cast_targets' AND column_name = 'target_banai'
  ) THEN 'OK' ELSE 'MISSING' END
UNION ALL
SELECT 'rank_targets column',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'cast_targets' AND column_name = 'rank_targets'
  ) THEN 'OK' ELSE 'MISSING' END;
