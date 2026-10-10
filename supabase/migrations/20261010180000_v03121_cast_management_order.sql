-- 管理のキャスト一覧の並び順をスタッフ共通で保存。他画面の表示順は変更しない。
BEGIN;

CREATE TABLE IF NOT EXISTS public.cast_management_order (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ordered_cast_ids uuid[] NOT NULL DEFAULT '{}' CHECK (array_position(ordered_cast_ids, NULL) IS NULL),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0 AND revision < 9007199254740991),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.cast_management_order (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.cast_management_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cast_management_order_staff_read ON public.cast_management_order;
CREATE POLICY cast_management_order_staff_read ON public.cast_management_order
  FOR SELECT TO authenticated
  USING (
    public.current_role() = 'admin'
    AND (public.staff_has_permission('キャスト.閲覧') OR public.staff_has_permission('キャスト.アカウント管理'))
  );

REVOKE ALL ON public.cast_management_order FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.cast_management_order TO authenticated;
GRANT ALL ON public.cast_management_order TO service_role;
COMMENT ON TABLE public.cast_management_order IS 'キャスト管理専用のスタッフ共通表示順。書き込みは認可済みAPIのrevision条件付き更新のみ。';

COMMIT;
