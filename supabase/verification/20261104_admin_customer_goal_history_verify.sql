-- 読取り専用のカタログ/列権限確認。DDL適用後にすべてtrue/0を確認する。
-- この確認は実ユーザーのJWT・SET ROLEによるRLS実挙動の検証の代替ではない。
-- 実RLSは scripts/test-customer-goal-history.mjs の隔離PostgreSQLでも確認する。
select relrowsecurity as goals_rls_must_be_true from pg_class where oid='public.customer_monthly_goals'::regclass;
select count(*)=3 as exactly_three_policies_must_be_true from pg_policies
where schemaname='public' and tablename='customer_monthly_goals' and roles=array['authenticated']::name[];
select cmd='SELECT' and strpos(qual,'star_log_access')>0 and strpos(qual,'viewer.role')>0
  and strpos(qual,'viewer.is_active')>0 and strpos(qual,'p.is_active')>0
  and strpos(qual,'c.cast_name')>0 and strpos(qual,'p.cast_name')>0 as scoped_history_read_policy_must_be_true
from pg_policies where schemaname='public' and tablename='customer_monthly_goals' and policyname='monthly_goals_read';
select count(*)=2 and bool_and(
  strpos(coalesce(qual,'')||coalesce(with_check,''),'star_log_access')>0
  and strpos(coalesce(qual,'')||coalesce(with_check,''),'c.cast_name')>0
  and strpos(coalesce(qual,'')||coalesce(with_check,''),'p.cast_name')>0
  and strpos(coalesce(qual,'')||coalesce(with_check,''),'c.is_starred')>0
  and strpos(coalesce(qual,'')||coalesce(with_check,''),'p.is_active')>0
  and strpos(coalesce(qual,'')||coalesce(with_check,''),'viewer.')=0
) as current_starred_write_guards_must_be_true
from pg_policies where schemaname='public' and tablename='customer_monthly_goals' and cmd in ('INSERT','UPDATE');
select has_table_privilege('authenticated','public.customer_monthly_goals','SELECT') as authenticated_select_must_be_true,
  not has_table_privilege('anon','public.customer_monthly_goals','SELECT') as anonymous_denied_must_be_true,
  not has_table_privilege('authenticated','public.customer_monthly_goals','DELETE') as delete_denied_must_be_true,
  not has_column_privilege('authenticated','public.customer_monthly_goals','cast_id','UPDATE') as cast_reassignment_denied_must_be_true,
  not has_column_privilege('authenticated','public.customer_monthly_goals','revision','UPDATE') as revision_forgery_denied_must_be_true;
select count(*) as invalid_goal_values_must_be_zero from public.customer_monthly_goals
where extract(day from month)<>1 or month<date '2000-01-01' or month>=date '2200-01-01'
  or target_sales<0 or target_sales>99999999 or target_visits<0 or target_visits>999
  or char_length(note)>2000 or revision<1;
