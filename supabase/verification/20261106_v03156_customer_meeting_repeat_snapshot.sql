-- この読取りSQLを対象migrationの適用前・直後に実行し、件数/ハッシュを比較する。
-- 会議ログ本文・顧客情報・資格情報は出力しない。保存RPCも呼ばない。
select 'meeting_record_snapshot' as snapshot_name,count(*) as row_count,
  md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' order by r.id),'')) as fingerprint
from public.customer_meeting_records r;

-- 定義変更する3関数のbodyを除外し、テーブル/列のACL・RLS・policy・trigger構造・
-- 既存の担当認可関数と3関数の実行権限/security/search_pathが不変であることを比較する。
select 'meeting_security_snapshot' as snapshot_name,md5(jsonb_build_object(
  'rls',(select relrowsecurity from pg_class where oid='public.customer_meeting_records'::regclass),
  'table_acl',(select relacl::text from pg_class where oid='public.customer_meeting_records'::regclass),
  'column_acl',(select jsonb_agg(jsonb_build_array(attname,attacl::text) order by attnum) from pg_attribute where attrelid='public.customer_meeting_records'::regclass and attnum>0),
  'policies',(select jsonb_agg(to_jsonb(p) order by policyname) from pg_policies p where schemaname='public' and tablename='customer_meeting_records'),
  'trigger',(select pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.customer_meeting_records'::regclass and tgname='stamp_customer_meeting_record'),
  'guard_functions',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.oid='public.star_log_access(bigint,boolean)'::regprocedure),
  'changed_function_acl',(select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,p.proacl::text,p.prosecdef,p.proconfig) order by p.oid) from pg_proc p where p.oid in ('public.customer_meeting_values_valid(jsonb)'::regprocedure,'public.stamp_customer_meeting_record()'::regprocedure,'public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)'::regprocedure))
)::text) as fingerprint;

select p.oid::regprocedure::text as function_name,md5(p.prosrc) as source_hash
from pg_proc p where p.oid in (
  'public.customer_meeting_values_valid(jsonb)'::regprocedure,
  'public.stamp_customer_meeting_record()'::regprocedure,
  'public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb)'::regprocedure
) order by function_name;
