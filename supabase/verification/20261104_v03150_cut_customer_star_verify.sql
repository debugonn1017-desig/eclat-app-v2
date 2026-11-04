-- 読取り専用。適用前は末尾のセキュリティ指紋を保存し、適用後と一致することを確認する。
-- 件数だけを返し、顧客名・備考は出力しない。実JWT/SET ROLEによるRLS検証の代替ではない。
-- 実挙動は scripts/test-cut-star.mjs の隔離PostgreSQLで検証する。本番では更新を実行しない。
select count(*) as cut_starred_must_be_zero from public.customers
where customer_rank = '切れた' and is_starred is true;
select count(*) as cut_open_cycles_must_be_zero
from public.customer_star_cycles cy join public.customers c on c.id = cy.customer_id
where c.customer_rank = '切れた' and cy.ended_at is null;
select count(*) = 1 and bool_and(tgtype = 23 and tgenabled = 'O') as cut_guard_trigger_must_be_true
from pg_trigger where tgrelid = 'public.customers'::regclass
  and tgname = 'enforce_cut_customer_star' and not tgisinternal;
select count(*) = 1 and bool_and(tgtype = 21 and tgattr::text = '' and tgenabled = 'O') as all_update_capture_must_be_true
from pg_trigger where tgrelid = 'public.customers'::regclass
  and tgname = 'capture_customer_star_cycle' and not tgisinternal;
select not prosecdef and proconfig = array['search_path=""']::text[] as invoker_empty_search_path_must_be_true,
  not has_function_privilege('anon',oid,'EXECUTE') as anon_direct_execution_denied_must_be_true,
  not has_function_privilege('authenticated',oid,'EXECUTE') as authenticated_direct_execution_denied_must_be_true,
  not exists (select 1 from aclexplode(coalesce(proacl,acldefault('f',proowner))) a
    where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_direct_execution_denied_must_be_true
from pg_proc where oid = 'public.enforce_cut_customer_star()'::regprocedure;

-- 以下の2指紋は適用前後で同じ値になる。顧客/目標/記録/ランクのRLS・ACLや既存関数を変更しない。
select md5(string_agg(snapshot, E'\n' order by snapshot)) as table_security_compare_before_and_after
from (
  select concat_ws('|','table',n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) as snapshot
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('customers','customer_star_cycles','customer_star_logs',
    'customer_star_log_changes','customer_monthly_goals','customer_rank_history')
  union all
  select concat_ws('|','policy',schemaname,tablename,policyname,permissive,roles::text,cmd,qual,with_check)
  from pg_policies where schemaname = 'public' and tablename in ('customers','customer_star_cycles','customer_star_logs',
    'customer_star_log_changes','customer_monthly_goals','customer_rank_history')
  union all
  select concat_ws('|','column',n.nspname,c.relname,a.attname,a.attacl::text)
  from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname in ('customers','customer_star_cycles','customer_star_logs',
    'customer_star_log_changes','customer_monthly_goals','customer_rank_history') and a.attnum > 0 and not a.attisdropped
) security_snapshot;
select md5(string_agg(concat_ws('|',p.oid::regprocedure::text,p.prosecdef,p.proconfig::text,p.proacl::text,p.prosrc), E'\n'
  order by p.oid::regprocedure::text)) as existing_function_security_compare_before_and_after
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('customer_rank_guard','customer_rank_log','customer_rank_snapshot',
  'customer_rank_snapshots','apply_customer_rank','apply_customer_rank_batch','capture_customer_star_cycle',
  'star_log_access','record_customer_star_log','restart_customer_star','stamp_customer_monthly_goal');
