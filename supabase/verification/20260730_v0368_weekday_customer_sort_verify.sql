-- v0.3.68 適用後の確認
-- 合格条件:
--   invalid_* / mismatch_* = 0
--   *_ok = true

select
  count(*) filter (
    where weekday_1_count < 0 or weekday_1_count > sample_visit_count
       or weekday_2_count < 0 or weekday_2_count > sample_visit_count
       or weekday_3_count < 0 or weekday_3_count > sample_visit_count
       or weekday_4_count < 0 or weekday_4_count > sample_visit_count
       or weekday_5_count < 0 or weekday_5_count > sample_visit_count
       or weekday_6_count < 0 or weekday_6_count > sample_visit_count
  ) as invalid_weekday_counts,
  count(*) filter (
    where (weekday_1_count = 0) <> (weekday_1_last_visit_date is null)
       or (weekday_2_count = 0) <> (weekday_2_last_visit_date is null)
       or (weekday_3_count = 0) <> (weekday_3_last_visit_date is null)
       or (weekday_4_count = 0) <> (weekday_4_last_visit_date is null)
       or (weekday_5_count = 0) <> (weekday_5_last_visit_date is null)
       or (weekday_6_count = 0) <> (weekday_6_last_visit_date is null)
  ) as invalid_weekday_date_pairs
from public.customer_visit_patterns;

with ranked_visits as (
  select
    customer_id,
    visit_date,
    extract(isodow from visit_date)::integer as weekday_code,
    row_number() over (
      partition by customer_id
      order by visit_date desc, visit_time desc nulls last, id desc
    ) as recent_number
  from public.customer_visits
  where is_planned is not true
),
expected as (
  select
    customer_id,
    count(*) filter (where weekday_code = 1) as weekday_1_count,
    max(visit_date) filter (where weekday_code = 1) as weekday_1_last_visit_date,
    count(*) filter (where weekday_code = 2) as weekday_2_count,
    max(visit_date) filter (where weekday_code = 2) as weekday_2_last_visit_date,
    count(*) filter (where weekday_code = 3) as weekday_3_count,
    max(visit_date) filter (where weekday_code = 3) as weekday_3_last_visit_date,
    count(*) filter (where weekday_code = 4) as weekday_4_count,
    max(visit_date) filter (where weekday_code = 4) as weekday_4_last_visit_date,
    count(*) filter (where weekday_code = 5) as weekday_5_count,
    max(visit_date) filter (where weekday_code = 5) as weekday_5_last_visit_date,
    count(*) filter (where weekday_code = 6) as weekday_6_count,
    max(visit_date) filter (where weekday_code = 6) as weekday_6_last_visit_date
  from ranked_visits
  where recent_number <= 10
  group by customer_id
)
select count(*) as mismatch_weekday_metrics
from expected
full join public.customer_visit_patterns actual using (customer_id)
where expected.customer_id is null
   or actual.customer_id is null
   or expected.weekday_1_count <> actual.weekday_1_count
   or expected.weekday_1_last_visit_date is distinct from actual.weekday_1_last_visit_date
   or expected.weekday_2_count <> actual.weekday_2_count
   or expected.weekday_2_last_visit_date is distinct from actual.weekday_2_last_visit_date
   or expected.weekday_3_count <> actual.weekday_3_count
   or expected.weekday_3_last_visit_date is distinct from actual.weekday_3_last_visit_date
   or expected.weekday_4_count <> actual.weekday_4_count
   or expected.weekday_4_last_visit_date is distinct from actual.weekday_4_last_visit_date
   or expected.weekday_5_count <> actual.weekday_5_count
   or expected.weekday_5_last_visit_date is distinct from actual.weekday_5_last_visit_date
   or expected.weekday_6_count <> actual.weekday_6_count
   or expected.weekday_6_last_visit_date is distinct from actual.weekday_6_last_visit_date;

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
  count(*) = 12 as weekday_columns_exist_ok
from information_schema.columns
where table_schema = 'public'
  and table_name = 'customer_search_metrics'
  and column_name ~ '^metric_pattern_weekday_[1-6]_(count|last_visit_date)$';
