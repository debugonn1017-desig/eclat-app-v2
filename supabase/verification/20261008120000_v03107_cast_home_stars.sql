-- 適用前：既存値と複合CHECKを確認。表示は旧層を保持するので自動変換しない。
select cast_tier, count(*) from public.profiles group by cast_tier order by cast_tier;
select tier, count(*) from public.cast_tier_targets group by tier order by tier;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint where contype='c'
and conrelid in ('public.profiles'::regclass,'public.cast_tier_targets'::regclass)
and (pg_get_constraintdef(oid) like '%cast_tier%' or pg_get_constraintdef(oid) like '%tier%');

-- 適用後：invalid_* = 0、*_ok = true が合格条件。
select count(*) as invalid_marks from public.customers where is_starred is null or no_reply is null;
select count(*) as invalid_average_targets from public.cast_targets where target_avg_spend < 0;
select count(*) as invalid_current_tiers from public.profiles where cast_tier is not null
and cast_tier not in ('AA','AB','AC','BA','BB','BC','新人','無類','C','A層','B層','新人層','C層','その他');
select count(*) as invalid_goal_tiers from public.profiles where target_cast_tier is not null
and target_cast_tier not in ('AA','AB','AC','BA','BB','BC','新人','無類','C');
select count(*) as mismatch_search_marks from public.customer_search_metrics_with_bottles v
join public.customers c on c.id=v.id where v.is_starred is distinct from c.is_starred or v.no_reply is distinct from c.no_reply;
select (select count(*) from public.customer_search_metrics_with_bottles)=(select count(*) from public.customers) as search_rows_ok;
-- 検索APIが参照する既存列と新規マーク列が残っていることを検査する。
with required_columns(name) as (
  select unnest(array[
    'id','customer_name','nickname','cast_name','cast_type','has_customer_staff',
    'nomination_status','age_group','occupation','region','spouse_status','birthday',
    'blood_type','hobby','nomination_route','relationship_type','phase','phase_shoshimei_at',
    'customer_rank','sales_expectation','trend','favorite_type','score','memo',
    'last_contact_date','next_contact_date','first_visit_date','monthly_target_visits',
    'monthly_target_sales','actual_visit_frequency','sales_priority','created_at',
    'metric_total_spent','metric_visit_count','metric_avg_per_visit','metric_last_visit_date',
    'metric_first_visit_date','metric_pattern_visit_count','metric_pattern_weekday_codes',
    'metric_pattern_early_hour','metric_pattern_early_hour_count','metric_pattern_early_last_visit_date',
    'metric_pattern_usual_hour','metric_pattern_usual_hour_count','metric_early_time_sort',
    'rank_sort','nomination_sort','has_incomplete_profile','search_text_with_bottles',
    'is_starred','no_reply'
  ])
  union all select 'metric_pattern_weekday_' || weekday || '_count' from generate_series(1,6) weekday
  union all select 'metric_pattern_weekday_' || weekday || '_last_visit_date' from generate_series(1,6) weekday
)
select not exists (
  select 1 from required_columns r where not exists (
    select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name='customer_search_metrics_with_bottles' and c.column_name=r.name
  )
) as search_columns_ok;
select coalesce(reloptions @> array['security_invoker=true'],false) as invoker_ok
from pg_class where oid='public.customer_search_metrics_with_bottles'::regclass;
select relrowsecurity as rls_ok from pg_class where oid='public.customers'::regclass;
select has_table_privilege('authenticated','public.customer_search_metrics_with_bottles','select') as authenticated_grant_ok,
not has_table_privilege('anon','public.customer_search_metrics_with_bottles','select') as anon_denied_ok;
select to_regclass('public.customers_starred_cast_idx') is not null as starred_index_ok;
select tablename,policyname,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('customers','profiles','cast_targets') order by tablename,policyname;
-- SQL Editor はオーナーとしてRLSを素通しする。キャスト実アカウントで
-- 星一覧/検索/編集/他castName指定が本人範囲に固定されることを別途確認する。
-- この版ではフォローアップの既存データは消去・移植していない。
