-- 読み取り専用。migration後の確認用。既存顧客の復帰/ランク変更は行わない。
SELECT column_name,data_type,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='public' AND table_name='customers'
  AND column_name IN ('customer_rank_origin','customer_rank_revision');

SELECT customer_rank,customer_rank_origin,count(*) AS customers
FROM public.customers GROUP BY customer_rank,customer_rank_origin ORDER BY customer_rank,customer_rank_origin;

SELECT count(*) AS invalid_metadata FROM public.customers
WHERE customer_rank_origin NOT IN ('unknown','manual','auto') OR customer_rank_revision<0;

-- 新規操作後はrevisionと履歴の最新版が一致すること。migration直後は0件。
SELECT count(*) AS missing_latest_history FROM public.customers c
WHERE c.customer_rank_revision>0 AND NOT EXISTS (
  SELECT 1 FROM public.customer_rank_history h WHERE h.customer_id=c.id AND h.revision=c.customer_rank_revision
    AND h.to_rank IS NOT DISTINCT FROM c.customer_rank AND h.to_origin=c.customer_rank_origin);

SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_rank_history'::regclass;
SELECT policyname,cmd,roles FROM pg_policies WHERE schemaname='public' AND tablename='customer_rank_history';
SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('customer_rank_snapshot','customer_rank_snapshots','apply_customer_rank','apply_customer_rank_batch');

SELECT has_table_privilege('authenticated','public.customer_rank_history','INSERT') AS authenticated_insert,
  has_table_privilege('authenticated','public.customer_rank_history','UPDATE') AS authenticated_update,
  has_table_privilege('authenticated','public.customer_rank_history','DELETE') AS authenticated_delete;

SELECT reloptions FROM pg_class WHERE oid='public.customer_search_metrics'::regclass;
SELECT column_name,ordinal_position FROM information_schema.columns
WHERE table_schema='public' AND table_name='customer_search_metrics' AND column_name IN (
  'customer_rank_origin','customer_rank_revision','metric_last_visit_date') ORDER BY ordinal_position;

-- 0円も実来店に含む。予定とJST今日より先の日付は除外。結果0件が正常。
SELECT count(*) AS inconsistent_last_visits FROM public.customer_search_metrics m
WHERE m.metric_last_visit_date IS DISTINCT FROM (
  SELECT max(v.visit_date) FROM public.customer_visits v WHERE v.customer_id=m.id
    AND v.is_planned IS NOT TRUE AND v.visit_date<=(now() AT TIME ZONE 'Asia/Tokyo')::date);
