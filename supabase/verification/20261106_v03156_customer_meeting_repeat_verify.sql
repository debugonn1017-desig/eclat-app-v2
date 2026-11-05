-- 本番へテスト保存せず、導入済みの定義・権限と旧/新JSONの互換性だけを確認する。
-- 旧ログがある本番では別のsnapshot.sqlを適用前後に実行し、件数・hash不変も確認する。
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
  and not has_function_privilege('anon','public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.customer_meeting_values_valid(jsonb)','EXECUTE') as ok;
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

with sample(v) as (values ('{"priority":"中","in_time":null,"out_time":null,"table_number":"","party_size":null,"honshimei":"","nomination_route":"","after_place":"","after_casts":"","next_info":"","contact_content":"","follow_period":"未設定","thank_you":false,"rally":false,"action":false,"meeting_amount":null,"meeting_unit_price":null}'::jsonb))
select 'legacy17_repeat18_compatibility' as check_name,
  public.customer_meeting_values_valid(v)
  and public.customer_meeting_values_valid(v || '{"repeat":false}'::jsonb)
  and public.customer_meeting_values_valid(v || '{"repeat":true}'::jsonb)
  and not public.customer_meeting_values_valid(v || '{"repeat":null}'::jsonb)
  and not public.customer_meeting_values_valid(v || '{"repeat":"true"}'::jsonb)
  and not public.customer_meeting_values_valid(v || '{"unknown":false}'::jsonb)
  and not public.customer_meeting_values_valid((v-'action') || '{"repeat":false}'::jsonb) as ok
from sample;

-- source_hashはCLI生成migrationの各関数bodyから算出。署名・security属性は上でも検証する。
with expected(name,source_hash) as (values
  ('customer_meeting_values_valid','b370cc94f3aeb382c07a98ef27e89329'),
  ('stamp_customer_meeting_record','b870bf614b7c86181254573a12f5d4a3'),
  ('save_customer_meeting','cec4fb224cc485b8685518433fb882c7')
)
select 'meeting_repeat_function_definitions' as check_name,count(*)=3 and bool_and(p.oid is not null and md5(p.prosrc)=e.source_hash) as ok
from expected e left join pg_proc p on p.pronamespace='public'::regnamespace and p.proname=e.name and p.oid in (
  'public.customer_meeting_values_valid(jsonb)'::regprocedure,
  'public.stamp_customer_meeting_record()'::regprocedure,
  'public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)'::regprocedure
);
