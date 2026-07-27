-- v0.3.58 migration 適用後の定義一致・権限確認
-- mismatch / excluded_* がすべて0、*_ok がすべてtrueなら合格。

with expected as (
  select
    c.id,
    case
      when c.nomination_status = 'フリー'
        or c.customer_rank = '切れた'
        then array[]::text[]
      else array_remove(array[
        case when nullif(btrim(c.customer_name), '') is null then 'customer_name' end,
        case when nullif(btrim(c.nickname), '') is null then 'nickname' end,
        case when nullif(btrim(c.age_group), '') is null then 'age_group' end,
        case when nullif(btrim(c.region), '') is null then 'region' end,
        case when nullif(btrim(c.spouse_status), '') is null then 'spouse_status' end,
        case when nullif(btrim(c.occupation), '') is null then 'occupation' end,
        case when nullif(btrim(c.nomination_status), '') is null then 'nomination_status' end
      ]::text[], null)
    end as missing_fields
  from public.customers c
),
rpc_counts as (
  select *
  from public.get_customer_core_quality_counts()
)
select
  (
    select count(*)
    from expected e
    join public.customer_core_quality q on q.id = e.id
    where q.missing_fields is distinct from e.missing_fields
      or q.is_incomplete is distinct from (cardinality(e.missing_fields) > 0)
  ) as core_quality_mismatch,
  (
    select count(*)
    from expected e
    join public.customer_search_metrics s on s.id = e.id
    where s.has_incomplete_profile
      is distinct from (cardinality(e.missing_fields) > 0)
  ) as search_quality_mismatch,
  (
    select count(*)
    from public.customer_core_quality
    where nomination_status = 'フリー'
      and is_incomplete
  ) as excluded_free_incomplete,
  (
    select count(*)
    from public.customer_core_quality
    where customer_rank = '切れた'
      and is_incomplete
  ) as excluded_severed_incomplete,
  (
    select count(*) = 2
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('customer_core_quality', 'customer_search_metrics')
      and coalesce(c.reloptions @> array['security_invoker=true'], false)
  ) as views_security_invoker_ok,
  (
    select count(*) = 2
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('customer_core_quality', 'customer_search_metrics')
      and grantee = 'authenticated'
      and privilege_type = 'SELECT'
  ) as authenticated_view_grants_ok,
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('customer_core_quality', 'customer_search_metrics')
      and grantee in ('PUBLIC', 'anon')
  ) as unsafe_view_grant_count,
  (
    select count(*) from public.customers
  ) - (
    select count(*) from public.customer_core_quality
  ) as core_view_count_difference,
  (
    select count(*) from public.customers
  ) - (
    select count(*) from public.customer_search_metrics
  ) as search_view_count_difference,
  (
    select count(*) from public.customer_core_quality where is_incomplete
  ) - (
    select incomplete_customers from rpc_counts
  ) as rpc_incomplete_count_difference;
