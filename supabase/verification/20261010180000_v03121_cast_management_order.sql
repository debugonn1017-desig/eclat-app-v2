-- 全ok=true、invalid_*は0。SQL Editorの管理接続だけでは実アカウントRLSの代替にならない。
SELECT count(*) = 1 AND bool_and(id) AS singleton_ok
FROM public.cast_management_order;

SELECT relrowsecurity AS rls_ok FROM pg_class
WHERE oid = 'public.cast_management_order'::regclass;

SELECT
  has_table_privilege('authenticated', 'public.cast_management_order', 'SELECT') AS staff_select_ok,
  NOT has_table_privilege('authenticated', 'public.cast_management_order', 'UPDATE') AS no_direct_update_ok,
  NOT has_table_privilege('authenticated', 'public.cast_management_order', 'INSERT') AS no_direct_insert_ok,
  NOT has_table_privilege('authenticated', 'public.cast_management_order', 'DELETE') AS no_direct_delete_ok,
  NOT has_table_privilege('anon', 'public.cast_management_order', 'SELECT') AS no_anon_read_ok;

SELECT count(*) FILTER (WHERE revision < 0 OR revision >= 9007199254740991) AS invalid_revision,
  count(*) FILTER (WHERE array_position(ordered_cast_ids, NULL) IS NOT NULL) AS invalid_null_ids,
  count(*) FILTER (WHERE cardinality(ordered_cast_ids) <> (SELECT count(DISTINCT value) FROM unnest(ordered_cast_ids) value)) AS invalid_duplicate_ids
FROM public.cast_management_order;

SELECT count(*) = 1 AS staff_read_policy_ok FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cast_management_order'
  AND policyname = 'cast_management_order_staff_read' AND cmd = 'SELECT'
  AND qual LIKE '%current_role%' AND qual LIKE '%キャスト.閲覧%' AND qual LIKE '%キャスト.アカウント管理%';
-- 本番実アカウント: 閲覧スタッフGET可/PUT不可、編集スタッフGET・PUT可、キャスト/未ログイン不可。
-- 削除済みキャストのIDが残ってもUIは無視し、次回保存で除く（既存履歴を消さない）。
