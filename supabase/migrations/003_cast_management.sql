-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — キャスト管理セットアップ (Phase 3)
-- ═══════════════════════════════════════════════════════════════════════
--
--  Supabase ダッシュボードの「SQL Editor」で実行する。
--  001_auth_setup.sql の後に実行すること。
--
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. profiles に cast_tier カラム追加
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'cast_tier'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN cast_tier text CHECK (cast_tier IN ('A層', 'B層', '新人層', '無類', 'C層'));
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 2. cast_tier_targets — 層ごとのベースノルマ
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cast_tier_targets (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tier            text NOT NULL CHECK (tier IN ('A層', 'B層', '新人層', '無類', 'C層')),
  month           text NOT NULL,                    -- 'YYYY-MM' 形式
  target_sales    bigint NOT NULL DEFAULT 0,        -- 売上ノルマ
  target_nominations  int DEFAULT 0,                -- 目標指名数
  target_new_customers int DEFAULT 0,               -- 目標新規獲得数
  target_work_days    int DEFAULT 0,                -- 目標出勤日数
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier, month)
);

ALTER TABLE public.cast_tier_targets ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "tier_targets_admin_all" ON public.cast_tier_targets;
CREATE POLICY "tier_targets_admin_all"
  ON public.cast_tier_targets FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 読み取りのみ
DROP POLICY IF EXISTS "tier_targets_cast_read" ON public.cast_tier_targets;
CREATE POLICY "tier_targets_cast_read"
  ON public.cast_tier_targets FOR SELECT
  USING (public.current_role() = 'cast');


-- ─────────────────────────────────────────────────────────────────────
-- 3. cast_targets — 個人ごとの月間目標（層ベースを上書き）
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cast_targets (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cast_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month           text NOT NULL,                    -- 'YYYY-MM' 形式
  target_sales    bigint,                           -- NULL=層ベースを使用
  target_nominations  int,
  target_new_customers int,
  target_work_days    int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cast_id, month)
);

ALTER TABLE public.cast_targets ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "cast_targets_admin_all" ON public.cast_targets;
CREATE POLICY "cast_targets_admin_all"
  ON public.cast_targets FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分のみ読み取り
DROP POLICY IF EXISTS "cast_targets_cast_read" ON public.cast_targets;
CREATE POLICY "cast_targets_cast_read"
  ON public.cast_targets FOR SELECT
  USING (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  );


-- ─────────────────────────────────────────────────────────────────────
-- 4. cast_shifts — シフトカレンダー
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cast_shifts (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cast_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shift_date      date NOT NULL,
  status          text NOT NULL CHECK (status IN ('出勤', '休み', '希望出勤', '希望休み', '未定'))
                  DEFAULT '未定',
  memo            text DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cast_id, shift_date)
);

ALTER TABLE public.cast_shifts ENABLE ROW LEVEL SECURITY;

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "shifts_admin_all" ON public.cast_shifts;
CREATE POLICY "shifts_admin_all"
  ON public.cast_shifts FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分のシフトのみ（読み書き）
DROP POLICY IF EXISTS "shifts_cast_all" ON public.cast_shifts;
CREATE POLICY "shifts_cast_all"
  ON public.cast_shifts FOR ALL
  USING (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  )
  WITH CHECK (
    public.current_role() = 'cast'
    AND cast_id = auth.uid()
  );


-- ─────────────────────────────────────────────────────────────────────
-- 5. updated_at 自動更新トリガ
-- ─────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS cast_tier_targets_updated ON public.cast_tier_targets;
CREATE TRIGGER cast_tier_targets_updated
  BEFORE UPDATE ON public.cast_tier_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cast_targets_updated ON public.cast_targets;
CREATE TRIGGER cast_targets_updated
  BEFORE UPDATE ON public.cast_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS cast_shifts_updated ON public.cast_shifts;
CREATE TRIGGER cast_shifts_updated
  BEFORE UPDATE ON public.cast_shifts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════
--  完了チェック
-- ═══════════════════════════════════════════════════════════════════════
SELECT 'cast_tier column' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'cast_tier'
  ) THEN 'OK' ELSE 'MISSING' END AS status
UNION ALL
SELECT 'cast_tier_targets', COUNT(*)::text FROM public.cast_tier_targets
UNION ALL
SELECT 'cast_targets', COUNT(*)::text FROM public.cast_targets
UNION ALL
SELECT 'cast_shifts', COUNT(*)::text FROM public.cast_shifts;
