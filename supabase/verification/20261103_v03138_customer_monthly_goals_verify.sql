-- 読取りのみ。新migration適用後、アプリ公開前にtrue/0を確認する。
select relrowsecurity as rls_must_be_true from pg_class where oid='public.customer_monthly_goals'::regclass;
select count(*)=3 as policies_must_be_true from pg_policies where schemaname='public' and tablename='customer_monthly_goals' and roles=array['authenticated']::name[];
select has_table_privilege('authenticated','public.customer_monthly_goals','SELECT') as authenticated_read_must_be_true,
  not has_table_privilege('anon','public.customer_monthly_goals','SELECT') as anonymous_denied_must_be_true,
  not has_table_privilege('authenticated','public.customer_monthly_goals','INSERT') as whole_insert_denied_must_be_true,
  not has_table_privilege('authenticated','public.customer_monthly_goals','UPDATE') as whole_update_denied_must_be_true,
  not has_table_privilege('authenticated','public.customer_monthly_goals','DELETE') as delete_denied_must_be_true,
  has_column_privilege('authenticated','public.customer_monthly_goals','target_sales','INSERT') as target_insert_must_be_true,
  has_column_privilege('authenticated','public.customer_monthly_goals','note','UPDATE') as note_update_must_be_true,
  not has_column_privilege('authenticated','public.customer_monthly_goals','revision','UPDATE') as revision_denied_must_be_true,
  not has_column_privilege('authenticated','public.customer_monthly_goals','updated_by','INSERT') as actor_denied_must_be_true,
  not has_column_privilege('authenticated','public.customer_monthly_goals','cast_id','UPDATE') as identity_denied_must_be_true;
select not prosecdef and proconfig @> array['search_path=public, pg_temp'] as invoker_fixed_path_must_be_true
  from pg_proc where oid='public.stamp_customer_monthly_goal()'::regprocedure;
select count(*)=1 as one_stamp_trigger_must_be_true from pg_trigger
  where tgrelid='public.customer_monthly_goals'::regclass and not tgisinternal and tgenabled='O' and tgfoid='public.stamp_customer_monthly_goal()'::regprocedure;
select count(*) as invalid_rows_must_be_zero from public.customer_monthly_goals
  where extract(day from month)<>1 or month<date '2000-01-01' or month>=date '2200-01-01'
  or target_sales<0 or target_sales>99999999 or target_visits<0 or target_visits>999
  or char_length(note)>2000 or revision<1;
