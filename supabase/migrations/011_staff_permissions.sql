-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — スタッフ権限管理 (Phase 11)
-- ═══════════════════════════════════════════════════════════════════════

-- オーナーフラグ追加
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT false;

-- オーナーを設定（メールアドレスで特定）
UPDATE public.profiles
SET is_owner = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'tmn1017@i.softbank.jp'
);

-- スタッフ権限テーブル
CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN (
    '顧客編集',
    'キャスト管理',
    'お知らせ管理',
    'レポート閲覧',
    '顧客引継ぎ'
  )),
  enabled    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, permission)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_staff_permissions_staff_id
  ON public.staff_permissions(staff_id);

-- RLS
ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;

-- オーナーのみ全操作可能
CREATE POLICY "staff_perms_owner_all"
  ON public.staff_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_owner = true
    )
  );

-- スタッフは自分の権限を読むことだけ可能
CREATE POLICY "staff_perms_self_read"
  ON public.staff_permissions FOR SELECT
  USING (staff_id = auth.uid());

-- ヘルパー関数: オーナー判定
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(
    (SELECT is_owner FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- ヘルパー関数: スタッフ権限チェック
CREATE OR REPLACE FUNCTION public.staff_has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    CASE
      -- オーナーは全権限あり
      WHEN (SELECT is_owner FROM public.profiles WHERE id = auth.uid()) THEN true
      -- スタッフは個別チェック
      ELSE COALESCE(
        (SELECT enabled FROM public.staff_permissions
         WHERE staff_id = auth.uid() AND permission = perm),
        false
      )
    END
$$;
