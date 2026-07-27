-- v0.3.57 performance migrations 適用後の等価性・権限確認
-- Supabase SQL Editor で phase_a → phase_b 適用後に実行する。
-- mismatch 系がすべて0、security_invoker がtrue、権限/indexが存在すれば合格。

-- 1. ホーム4件数: 旧インライン定義と新RPCの一致
with
today as (
  select (now() at time zone 'Asia/Tokyo')::date as value
),
old_counts as (
  select
    (
      select count(*)
      from public.planned_visits
      where status = '予定'
        and planned_date = (select value from today)
    ) as today_planned_visits,
    (
      select count(*)
      from public.customer_follow_ups
      where is_active = true
    ) as active_follow_ups,
    (
      select count(*)
      from public.customer_follow_ups
      where is_active = true
        and next_contact_date is not null
        and next_contact_date <= (select value from today)
    ) as due_follow_ups,
    (
      select count(*)
      from public.customers c
      where
        nullif(btrim(c.customer_name), '') is null
        or nullif(btrim(c.nickname), '') is null
        or nullif(btrim(c.age_group), '') is null
        or nullif(btrim(c.region), '') is null
        or nullif(btrim(c.spouse_status), '') is null
        or nullif(btrim(c.occupation), '') is null
        or nullif(btrim(c.nomination_status), '') is null
    ) as incomplete_customers
),
new_counts as (
  select *
  from public.get_daily_workflow_summary((select value from today))
)
select
  case when o.today_planned_visits = n.today_planned_visits then 0 else 1 end
    as planned_mismatch,
  case when o.active_follow_ups = n.active_follow_ups then 0 else 1 end
    as active_follow_up_mismatch,
  case when o.due_follow_ups = n.due_follow_ups then 0 else 1 end
    as due_follow_up_mismatch,
  case when o.incomplete_customers = n.incomplete_customers then 0 else 1 end
    as incomplete_mismatch
from old_counts o
cross join new_counts n;

-- 2. 情報不足view: 行数・配列判定の一致
select count(*) as quality_row_mismatch
from public.customers c
join public.customer_core_quality q on q.id = c.id
where q.missing_fields is distinct from array_remove(array[
  case when nullif(btrim(c.customer_name), '') is null then 'customer_name' end,
  case when nullif(btrim(c.nickname), '') is null then 'nickname' end,
  case when nullif(btrim(c.age_group), '') is null then 'age_group' end,
  case when nullif(btrim(c.region), '') is null then 'region' end,
  case when nullif(btrim(c.spouse_status), '') is null then 'spouse_status' end,
  case when nullif(btrim(c.occupation), '') is null then 'occupation' end,
  case when nullif(btrim(c.nomination_status), '') is null then 'nomination_status' end
]::text[], null);

select
  (select count(*) from public.customers)
  - (select count(*) from public.customer_core_quality)
  as quality_view_count_difference;

-- 3. お客様検索の来店集計: 旧集計と新viewの一致
with old_metrics as (
  select
    c.id,
    coalesce(sum(v.amount_spent), 0) as total_spent,
    count(v.id) as visit_count,
    case
      when count(v.id) > 0
        then round(coalesce(sum(v.amount_spent), 0)::numeric / count(v.id))
      else 0
    end as avg_per_visit,
    max(v.visit_date) as last_visit_date,
    min(v.visit_date) filter (where v.is_first_visit = true) as first_visit_date
  from public.customers c
  left join public.customer_visits v on v.customer_id = c.id
  group by c.id
)
select count(*) as search_metric_mismatch
from old_metrics o
join public.customer_search_metrics n on n.id = o.id
where
  n.metric_total_spent is distinct from o.total_spent
  or n.metric_visit_count is distinct from o.visit_count
  or n.metric_avg_per_visit is distinct from o.avg_per_visit
  or n.metric_last_visit_date is distinct from o.last_visit_date
  or n.metric_first_visit_date is distinct from o.first_visit_date;

select
  (select count(*) from public.customers)
  - (select count(*) from public.customer_search_metrics)
  as search_view_count_difference;

-- 4. お客様検索の「未登録あり」: 旧クライアント判定と新viewの一致
-- score は本番DBでは text。旧JSで空扱いになるDB値は NULL / '' のみ
-- ('0' は文字列で truthy)。
select count(*) as search_incomplete_mismatch
from public.customers c
join public.customer_search_metrics n on n.id = c.id
where n.has_incomplete_profile is distinct from (
  c.age_group is null or c.age_group = ''
  or c.region is null or c.region = ''
  or c.spouse_status is null or c.spouse_status = ''
  or c.occupation is null or c.occupation = ''
  or c.cast_type is null or c.cast_type = ''
  or c.nomination_route is null or c.nomination_route = ''
  or c.nomination_status is null or c.nomination_status = ''
  or c.phase is null or c.phase = ''
  or c.customer_rank is null or c.customer_rank = ''
  or c.sales_expectation is null or c.sales_expectation = ''
  or c.trend is null or c.trend = ''
  or c.favorite_type is null or c.favorite_type = ''
  or c.score is null or c.score = ''
);

-- 5. SECURITY INVOKER / grant / index
select
  c.relname as view_name,
  coalesce(c.reloptions @> array['security_invoker=true'], false) as security_invoker
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('customer_core_quality', 'customer_search_metrics')
order by c.relname;

select
  routine_name,
  security_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_customer_core_quality_counts',
    'get_daily_workflow_summary'
  )
order by routine_name;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('customer_core_quality', 'customer_search_metrics')
order by table_name, grantee, privilege_type;

select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_follow_ups_active_due',
    'idx_planned_visits_date_status'
  )
order by indexname;

-- 6. 最後に1行で合否を確認するサマリー
-- SQL Editor は複数SELECTのうち最後の結果を表示するため、この行の mismatch /
-- difference / unsafe_grant がすべて0、*_ok がすべてtrueなら合格。
with
today as (
  select (now() at time zone 'Asia/Tokyo')::date as value
),
old_daily as (
  select
    (
      select count(*)
      from public.planned_visits
      where status = '予定'
        and planned_date = (select value from today)
    ) as today_planned_visits,
    (
      select count(*)
      from public.customer_follow_ups
      where is_active = true
    ) as active_follow_ups,
    (
      select count(*)
      from public.customer_follow_ups
      where is_active = true
        and next_contact_date is not null
        and next_contact_date <= (select value from today)
    ) as due_follow_ups,
    (
      select count(*)
      from public.customers c
      where
        nullif(btrim(c.customer_name), '') is null
        or nullif(btrim(c.nickname), '') is null
        or nullif(btrim(c.age_group), '') is null
        or nullif(btrim(c.region), '') is null
        or nullif(btrim(c.spouse_status), '') is null
        or nullif(btrim(c.occupation), '') is null
        or nullif(btrim(c.nomination_status), '') is null
    ) as incomplete_customers
),
new_daily as (
  select *
  from public.get_daily_workflow_summary((select value from today))
),
old_metrics as (
  select
    c.id,
    coalesce(sum(v.amount_spent), 0) as total_spent,
    count(v.id) as visit_count,
    case
      when count(v.id) > 0
        then round(coalesce(sum(v.amount_spent), 0)::numeric / count(v.id))
      else 0
    end as avg_per_visit,
    max(v.visit_date) as last_visit_date,
    min(v.visit_date) filter (where v.is_first_visit = true) as first_visit_date
  from public.customers c
  left join public.customer_visits v on v.customer_id = c.id
  group by c.id
)
select
  case when o.today_planned_visits = n.today_planned_visits then 0 else 1 end
    as planned_mismatch,
  case when o.active_follow_ups = n.active_follow_ups then 0 else 1 end
    as active_follow_up_mismatch,
  case when o.due_follow_ups = n.due_follow_ups then 0 else 1 end
    as due_follow_up_mismatch,
  case when o.incomplete_customers = n.incomplete_customers then 0 else 1 end
    as incomplete_mismatch,
  (
    select count(*)
    from public.customers c
    join public.customer_core_quality q on q.id = c.id
    where q.missing_fields is distinct from array_remove(array[
      case when nullif(btrim(c.customer_name), '') is null then 'customer_name' end,
      case when nullif(btrim(c.nickname), '') is null then 'nickname' end,
      case when nullif(btrim(c.age_group), '') is null then 'age_group' end,
      case when nullif(btrim(c.region), '') is null then 'region' end,
      case when nullif(btrim(c.spouse_status), '') is null then 'spouse_status' end,
      case when nullif(btrim(c.occupation), '') is null then 'occupation' end,
      case when nullif(btrim(c.nomination_status), '') is null then 'nomination_status' end
    ]::text[], null)
  ) as quality_row_mismatch,
  (
    select (select count(*) from public.customers)
      - (select count(*) from public.customer_core_quality)
  ) as quality_view_count_difference,
  (
    select count(*)
    from old_metrics m
    join public.customer_search_metrics s on s.id = m.id
    where
      s.metric_total_spent is distinct from m.total_spent
      or s.metric_visit_count is distinct from m.visit_count
      or s.metric_avg_per_visit is distinct from m.avg_per_visit
      or s.metric_last_visit_date is distinct from m.last_visit_date
      or s.metric_first_visit_date is distinct from m.first_visit_date
  ) as search_metric_mismatch,
  (
    select (select count(*) from public.customers)
      - (select count(*) from public.customer_search_metrics)
  ) as search_view_count_difference,
  (
    select count(*)
    from public.customers c
    join public.customer_search_metrics s on s.id = c.id
    where s.has_incomplete_profile is distinct from (
      c.age_group is null or c.age_group = ''
      or c.region is null or c.region = ''
      or c.spouse_status is null or c.spouse_status = ''
      or c.occupation is null or c.occupation = ''
      or c.cast_type is null or c.cast_type = ''
      or c.nomination_route is null or c.nomination_route = ''
      or c.nomination_status is null or c.nomination_status = ''
      or c.phase is null or c.phase = ''
      or c.customer_rank is null or c.customer_rank = ''
      or c.sales_expectation is null or c.sales_expectation = ''
      or c.trend is null or c.trend = ''
      or c.favorite_type is null or c.favorite_type = ''
      or c.score is null or c.score = ''
    )
  ) as search_incomplete_mismatch,
  (
    select count(*) = 2
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname in ('customer_core_quality', 'customer_search_metrics')
      and coalesce(c.reloptions @> array['security_invoker=true'], false)
  ) as views_security_invoker_ok,
  (
    select count(*) = 2
    from information_schema.routines
    where routine_schema = 'public'
      and routine_name in (
        'get_customer_core_quality_counts',
        'get_daily_workflow_summary'
      )
      and security_type = 'INVOKER'
  ) as functions_security_invoker_ok,
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
    select count(*) = 2
    from pg_indexes
    where schemaname = 'public'
      and indexname in (
        'idx_follow_ups_active_due',
        'idx_planned_visits_date_status'
      )
  ) as indexes_ok
from old_daily o
cross join new_daily n;
