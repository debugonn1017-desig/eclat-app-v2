-- v0.3.75 verification
-- 合格条件:
--   - *_row_count_matches / *_security_invoker / *_authenticated_select = true
--   - public_or_anon_grants = 0
--   - bottle_search_mismatches = 0

select
  (select count(*) from public.customer_search_metrics_with_bottles)
    = (select count(*) from public.customer_search_metrics)
    as search_row_count_matches,
  (select count(*) from public.customer_core_quality_with_bottles)
    = (select count(*) from public.customer_core_quality)
    as quality_row_count_matches;

select
  coalesce(
    (
      select (c.reloptions @> array['security_invoker=true'])
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'customer_search_metrics_with_bottles'
    ),
    false
  ) as search_security_invoker,
  coalesce(
    (
      select (c.reloptions @> array['security_invoker=true'])
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'customer_core_quality_with_bottles'
    ),
    false
  ) as quality_security_invoker;

select
  has_table_privilege(
    'authenticated',
    'public.customer_search_metrics_with_bottles',
    'select'
  ) as search_authenticated_select,
  has_table_privilege(
    'authenticated',
    'public.customer_core_quality_with_bottles',
    'select'
  ) as quality_authenticated_select,
  count(*) filter (where grantee in ('PUBLIC', 'anon')) as public_or_anon_grants
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'customer_search_metrics_with_bottles',
    'customer_core_quality_with_bottles'
  );

with bottle_names as (
  select
    customer_id,
    string_agg(btrim(bottle_name), ' ' order by id)
      filter (where nullif(btrim(bottle_name), '') is not null) as bottle_names
  from public.customer_bottles
  group by customer_id
),
expected as (
  select
    metrics.id,
    lower(concat_ws(' ', metrics.search_text, bottles.bottle_names))
      as expected_search_text
  from public.customer_search_metrics metrics
  left join bottle_names bottles on bottles.customer_id = metrics.id
)
select count(*) as bottle_search_mismatches
from expected e
join public.customer_search_metrics_with_bottles actual on actual.id = e.id
where actual.search_text_with_bottles is distinct from e.expected_search_text;
