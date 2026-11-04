-- 読取りだけで導入状態を確認する。本番顧客へテスト記録を作らない。
select 'meeting_table_rls' as check_name,coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.customer_meeting_records')),false) as ok;
select 'authenticated_read_insert_only' as check_name,
  has_table_privilege('authenticated','public.customer_meeting_records','SELECT')
  and has_column_privilege('authenticated','public.customer_meeting_records','values','INSERT')
  and not has_table_privilege('authenticated','public.customer_meeting_records','UPDATE')
  and not has_table_privilege('authenticated','public.customer_meeting_records','DELETE')
  and not has_column_privilege('authenticated','public.customer_meeting_records','actor_name','INSERT')
  and not has_column_privilege('authenticated','public.customer_meeting_records','revision','INSERT') as ok;
select 'anon_has_no_access' as check_name,
  not has_table_privilege('anon','public.customer_meeting_records','SELECT')
  and not has_table_privilege('anon','public.customer_meeting_records','INSERT')
  and not has_function_privilege('anon','public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)','EXECUTE') as ok;
select 'invoker_functions' as check_name,count(*)=3 and bool_and(not prosecdef) as ok from pg_proc where oid in (
  'public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)'::regprocedure,
  'public.stamp_customer_meeting_record()'::regprocedure,
  'public.customer_meeting_values_valid(jsonb)'::regprocedure
);
select 'read_insert_policies_only' as check_name,count(*)=2 and bool_and(cmd in ('SELECT','INSERT') and roles=array['authenticated']::name[]) as ok from pg_policies where schemaname='public' and tablename='customer_meeting_records';
select 'trigger_active' as check_name,exists(select 1 from pg_trigger where tgrelid='public.customer_meeting_records'::regclass and tgname='stamp_customer_meeting_record' and tgenabled='O') as ok;
select 'existing_visit_delete_unblocked' as check_name,not exists(select 1 from pg_constraint where conrelid='public.customer_meeting_records'::regclass and contype='f' and confrelid='public.customer_visits'::regclass) as ok;
select 'record_constraints' as check_name,
  exists(select 1 from pg_constraint where conrelid='public.customer_meeting_records'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (visit_id, revision)')
  and exists(select 1 from pg_constraint where conrelid='public.customer_meeting_records'::regclass and contype='u' and pg_get_constraintdef(oid)='UNIQUE (request_id)') as ok;
select 'invalid_meeting_rows' as check_name,count(*)=0 as ok from public.customer_meeting_records where not public.customer_meeting_values_valid("values") or revision<>base_revision+1 or expected_visit_date<>visit_date or actor_id is null;
