-- ═══════════════════════════════════════════════════════════════════════
--  Éclat — 認証 & 権限セットアップ (Phase 1)
-- ═══════════════════════════════════════════════════════════════════════
--
--  このファイルは Supabase ダッシュボードの「SQL Editor」で実行する。
--  上から順に1回だけ実行すれば OK。
--
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
-- 1. profiles テーブル (auth.users と 1対1)
-- ─────────────────────────────────────────────────────────────────────
-- auth.users はSupabase標準の認証ユーザーテーブル（見えない）
-- そこに紐づく「役割・キャスト名・有効/無効」を保持する場所

CREATE TABLE IF NOT EXISTS public.profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('admin', 'cast')),
  cast_name     text,                      -- castロールのみ使用
  display_name  text,                      -- 表示名（画面に出す）
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- cast_nameは一意（重複キャスト名を防ぐ）
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cast_name_unique
  ON public.profiles (cast_name)
  WHERE cast_name IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────
-- 2. 便利関数: 現在ログイン中の自分の role / cast_name / is_active を返す
-- ─────────────────────────────────────────────────────────────────────
-- RLSポリシーから使う。SECURITY DEFINER で自己参照の無限ループを回避。

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true
$$;

CREATE OR REPLACE FUNCTION public.current_cast_name()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cast_name FROM public.profiles WHERE id = auth.uid() AND is_active = true
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS を有効化
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_visits  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────
-- 4. profiles のポリシー
-- ─────────────────────────────────────────────────────────────────────

-- 自分のプロフィールは自分で見れる
DROP POLICY IF EXISTS "profiles_self_read"  ON public.profiles;
CREATE POLICY "profiles_self_read"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

-- 管理者は全プロフィールを見れる
DROP POLICY IF EXISTS "profiles_admin_read" ON public.profiles;
CREATE POLICY "profiles_admin_read"
  ON public.profiles FOR SELECT
  USING (public.current_role() = 'admin');

-- 管理者は全プロフィールを変更できる
DROP POLICY IF EXISTS "profiles_admin_write" ON public.profiles;
CREATE POLICY "profiles_admin_write"
  ON public.profiles FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');


-- ─────────────────────────────────────────────────────────────────────
-- 5. customers のポリシー
-- ─────────────────────────────────────────────────────────────────────

-- 管理者: 全件アクセス
DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;
CREATE POLICY "customers_admin_all"
  ON public.customers FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分の担当顧客のみ (SELECT)
DROP POLICY IF EXISTS "customers_cast_read" ON public.customers;
CREATE POLICY "customers_cast_read"
  ON public.customers FOR SELECT
  USING (
    public.current_role() = 'cast'
    AND cast_name = public.current_cast_name()
  );

-- キャスト: 自分の担当顧客を更新
DROP POLICY IF EXISTS "customers_cast_update" ON public.customers;
CREATE POLICY "customers_cast_update"
  ON public.customers FOR UPDATE
  USING (
    public.current_role() = 'cast'
    AND cast_name = public.current_cast_name()
  )
  WITH CHECK (
    public.current_role() = 'cast'
    AND cast_name = public.current_cast_name()
  );

-- キャスト: 新規登録（自分を担当にした場合のみ）
DROP POLICY IF EXISTS "customers_cast_insert" ON public.customers;
CREATE POLICY "customers_cast_insert"
  ON public.customers FOR INSERT
  WITH CHECK (
    public.current_role() = 'cast'
    AND cast_name = public.current_cast_name()
  );

-- キャストは顧客削除はできない（管理者のみ）


-- ─────────────────────────────────────────────────────────────────────
-- 6. customer_visits のポリシー
-- ─────────────────────────────────────────────────────────────────────
-- 顧客の担当キャスト = 来店記録の操作権限

-- 管理者: 全件
DROP POLICY IF EXISTS "visits_admin_all" ON public.customer_visits;
CREATE POLICY "visits_admin_all"
  ON public.customer_visits FOR ALL
  USING (public.current_role() = 'admin')
  WITH CHECK (public.current_role() = 'admin');

-- キャスト: 自分の担当顧客の来店記録のみ
DROP POLICY IF EXISTS "visits_cast_all" ON public.customer_visits;
CREATE POLICY "visits_cast_all"
  ON public.customer_visits FOR ALL
  USING (
    public.current_role() = 'cast'
    AND EXISTS (
      SELECT 1 FROM public.customers
      WHERE customers.id = customer_visits.customer_id
        AND customers.cast_name = public.current_cast_name()
    )
  )
  WITH CHECK (
    public.current_role() = 'cast'
    AND EXISTS (
      SELECT 1 FROM public.customers
      WHERE customers.id = customer_visits.customer_id
        AND customers.cast_name = public.current_cast_name()
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 7. updated_at 自動更新トリガ
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ═══════════════════════════════════════════════════════════════════════
--  完了チェック: 以下が成功すればこのファイルは正しく実行された
-- ═══════════════════════════════════════════════════════════════════════
SELECT
  'profiles table'  AS item, COUNT(*)::text AS status FROM public.profiles
UNION ALL SELECT 'customers RLS',   CASE WHEN relrowsecurity THEN 'ON' ELSE 'OFF' END
  FROM pg_class WHERE relname = 'customers'
UNION ALL SELECT 'visits RLS',      CASE WHEN relrowsecurity THEN 'ON' ELSE 'OFF' END
  FROM pg_class WHERE relname = 'customer_visits';
