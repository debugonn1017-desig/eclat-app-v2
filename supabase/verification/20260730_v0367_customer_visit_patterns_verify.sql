-- v0.3.67 適用後の確認
-- 合格条件:
--   invalid_* / mismatch_* = 0
--   *_ok = true

select
  count(*) filter (
    where sample_visit_count < 1 or sample_visit_count > 10
  ) as invalid_sample_count,
  count(*) filter (
    where early_hour is not null and early_hour not in (20, 21, 22, 23, 0)
  ) as invalid_early_hour,
  count(*) filter (
    where usual_hour is not null and usual_hour not in (20, 21, 22, 23, 0)
  ) as invalid_usual_hour,
  count(*) filter (
    where early_time_sort not between 0 and 5
  ) as invalid_early_sort,
  count(*) filter (
    where cardinality(weekday_codes) > 2
       or exists (
         select 1 from unnest(weekday_codes) weekday_code
         where weekday_code not between 1 and 7
       )
  ) as invalid_weekdays
from public.customer_visit_patterns;

with expected as (
  select customer_id, least(count(*), 10)::bigint as sample_visit_count
  from public.customer_visits
  where is_planned is not true
  group by customer_id
)
select count(*) as mismatch_sample_counts
from expected
full join public.customer_visit_patterns actual using (customer_id)
where expected.customer_id is null
   or actual.customer_id is null
   or expected.sample_visit_count <> actual.sample_visit_count;

select
  (
    select count(*) from public.customer_search_metrics
  ) = (
    select count(*) from public.customers
  ) as search_row_count_ok;

select
  bool_and(c.reloptions @> array['security_invoker=true']) as security_invoker_ok
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('customer_visit_patterns', 'customer_search_metrics');

select
  count(*) = 2 as authenticated_select_grants_ok
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('customer_visit_patterns', 'customer_search_metrics')
  and grantee = 'authenticated'
  and privilege_type = 'SELECT';

select
  count(*) = 0 as dangerous_public_grants_ok
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('customer_visit_patterns', 'customer_search_metrics')
  and grantee in ('PUBLIC', 'anon');

select
  count(*) = 8 as pattern_columns_exist_ok
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customer_search_metrics'
  and column_name in (
    'metric_pattern_visit_count',
    'metric_pattern_weekday_codes',
    'metric_pattern_early_hour',
    'metric_pattern_early_hour_count',
    'metric_pattern_early_last_visit_date',
    'metric_pattern_usual_hour',
    'metric_pattern_usual_hour_count',
    'metric_early_time_sort'
  );
