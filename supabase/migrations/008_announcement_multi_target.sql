-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — お知らせ: 個人指定を複数対応 (Phase 8)
-- ═══════════════════════════════════════════════════════════════════════

-- target_cast_id (単一UUID) → target_cast_ids (JSONB配列) に変更
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_cast_ids jsonb DEFAULT '[]';

-- 既存データを移行（単一→配列）
UPDATE public.announcements
  SET target_cast_ids = jsonb_build_array(target_cast_id::text)
  WHERE target_cast_id IS NOT NULL
    AND (target_cast_ids IS NULL OR target_cast_ids = '[]'::jsonb);

-- RLSポリシー更新（配列に自分のIDが含まれるかチェック）
DROP POLICY IF EXISTS "announcements_cast_read" ON public.announcements;
CREATE POLICY "announcements_cast_read"
  ON public.announcements FOR SELECT
  USING (
    public.current_role() = 'cast'
    AND is_active = true
    AND (
      target_type = 'all'
      OR target_cast_ids ? auth.uid()::text
    )
  );
