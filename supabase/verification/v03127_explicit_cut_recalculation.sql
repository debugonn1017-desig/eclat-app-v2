-- 読み取り専用。再評価や顧客ランクの変更はしない。
SELECT pg_get_functiondef('public.apply_customer_rank(bigint,jsonb,text,text,uuid,text)'::regprocedure)
  LIKE '%p_operation=''recalculate''%' AS explicit_recalculation_ready;
SELECT pg_get_constraintdef(oid) LIKE '%recalculate%' AS history_operation_ready
FROM pg_constraint WHERE conrelid='public.customer_rank_history'::regclass
  AND conname='customer_rank_history_operation_check';
SELECT has_function_privilege('authenticated','public.apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS authenticated_execute,
  has_function_privilege('anon','public.apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS anon_execute,
  has_function_privilege('service_role','public.apply_customer_rank(bigint,jsonb,text,text,uuid,text)','EXECUTE') AS service_execute;
SELECT relrowsecurity FROM pg_class WHERE oid='public.customer_rank_history'::regclass;
SELECT customer_rank,customer_rank_origin,count(*) AS customers
FROM public.customers GROUP BY customer_rank,customer_rank_origin ORDER BY customer_rank,customer_rank_origin;
SELECT count(*) AS missing_latest_history FROM public.customers c
WHERE c.customer_rank_revision>0 AND NOT EXISTS (
  SELECT 1 FROM public.customer_rank_history h WHERE h.customer_id=c.id AND h.revision=c.customer_rank_revision
    AND h.to_rank IS NOT DISTINCT FROM c.customer_rank AND h.to_origin=c.customer_rank_origin);
