-- 読取のみ。本番顧客への検証用訂正は実行しない。
with target as (
  select 'public.correct_customer_visit_nomination(uuid,bigint,jsonb,text,bigint,date,text,text,integer,uuid,boolean)'::regprocedure::oid as oid
), checks as (
 select 'correction_table_rls' as name,(select relrowsecurity from pg_class where oid='public.customer_visit_nomination_corrections'::regclass) as ok
 union all select 'authenticated_read_policy',exists(select 1 from pg_policies where schemaname='public' and tablename='customer_visit_nomination_corrections' and cmd='SELECT' and roles::text='{authenticated}' and qual like '%star_log_access%')
 union all select 'service_only_rpc',has_function_privilege('service_role',(select oid from target),'EXECUTE') and not has_function_privilege('anon',(select oid from target),'EXECUTE') and not has_function_privilege('authenticated',(select oid from target),'EXECUTE')
 union all select 'rpc_security_invoker',not (select prosecdef from pg_proc where oid=(select oid from target))
 union all select 'rpc_empty_search_path',exists(select 1 from pg_proc where oid=(select oid from target) and proconfig::text like '%search_path=%')
 union all select 'authenticated_audit_read_only',has_column_privilege('authenticated','public.customer_visit_nomination_corrections','actor_name','SELECT') and not has_table_privilege('authenticated','public.customer_visit_nomination_corrections','INSERT') and not has_table_privilege('authenticated','public.customer_visit_nomination_corrections','UPDATE') and not has_table_privilege('authenticated','public.customer_visit_nomination_corrections','DELETE')
 union all select 'private_request_fingerprint',not has_column_privilege('authenticated','public.customer_visit_nomination_corrections','request_fingerprint','SELECT') and not has_table_privilege('anon','public.customer_visit_nomination_corrections','SELECT')
 union all select 'service_audit_append_only',has_table_privilege('service_role','public.customer_visit_nomination_corrections','INSERT') and not has_table_privilege('service_role','public.customer_visit_nomination_corrections','UPDATE') and not has_table_privilege('service_role','public.customer_visit_nomination_corrections','DELETE')
 union all select 'old_10minute_trigger_removed',not exists(select 1 from pg_trigger where tgrelid='public.nomination_history'::regclass and tgname='nomination_history_sync_recent_visit_nomination' and not tgisinternal)
 union all select 'new_visit_snapshot_trigger_preserved',exists(select 1 from pg_trigger where tgrelid='public.customer_visits'::regclass and tgname='customer_visits_snapshot_nomination_status' and tgenabled='O')
 union all select 'request_id_unique',exists(select 1 from pg_constraint where conrelid='public.customer_visit_nomination_corrections'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (request_id)')
 union all select 'visit_revision_unique',exists(select 1 from pg_constraint where conrelid='public.customer_visit_nomination_corrections'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (visit_id, revision)')
 union all select 'initial_audit_empty',not exists(select 1 from public.customer_visit_nomination_corrections)
)
select * from checks order by name;

-- Reviewed関数本文との比較用。初回適用後に記録し、migrationのPGlite値と照合する。
select p.oid::regprocedure::text as function,md5(pg_get_functiondef(p.oid)) as body_hash
from pg_proc p
where p.oid='public.correct_customer_visit_nomination(uuid,bigint,jsonb,text,bigint,date,text,text,integer,uuid,boolean)'::regprocedure;
