-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — お知らせバナー機能 (Phase 7)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.announcements (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title           text NOT NULL DEFAULT '',
  body            text NOT NULL DEFAULT '',
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('important', 'normal')),
  target_type     text NOT NULL DEFAULT 'all'
                  CHECK (target_type IN ('all', 'individual')),
  target_cast_id  uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
CREATE POLICY "announcements_admin_all"
  ON public.announcements FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分宛 or 全体のアクティブなもののみ読み取り
DROP POLICY IF EXISTS "announcements_cast_read" ON public.announcements;
CREATE POLICY "announcements_cast_read"
  ON public.announcements FOR SELECT
  USING (
    public.current_role() = 'cast'
    AND is_active = true
    AND (
      target_type = 'all'
      OR target_cast_id = auth.uid()
    )
  );

-- updated_at 自動更新
DROP TRIGGER IF EXISTS announcements_updated ON public.announcements;
CREATE TRIGGER announcements_updated
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 完了チェック
SELECT 'announcements' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'announcements'
  ) THEN 'OK' ELSE 'MISSING' END AS status;
