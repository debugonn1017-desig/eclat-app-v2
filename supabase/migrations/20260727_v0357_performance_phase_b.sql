-- v0.3.57-B: お客様検索の来店集計をDBへ移し、ページ単位で返せるようにする。
--
-- SECURITY INVOKER により customers / customer_visits の既存RLSをそのまま適用する。
-- キャストに他キャストの顧客や来店情報を見せないことが最優先。

create or replace view public.customer_search_metrics
with (security_invoker = true)
as
select
  c.*,
  lower(
    coalesce(c.customer_name, '')
    || ' '
    || coalesce(c.nickname, '')
  ) as search_text,
  coalesce(v.total_spent, 0) as metric_total_spent,
  coalesce(v.visit_count, 0) as metric_visit_count,
  case
    when coalesce(v.visit_count, 0) > 0
      then round(v.total_spent::numeric / v.visit_count)
    else 0
  end as metric_avg_per_visit,
  v.last_visit_date as metric_last_visit_date,
  v.first_visit_date as metric_first_visit_date,
  case c.customer_rank
    when 'S' then 0
    when 'A' then 1
    when 'B' then 2
    when 'C' then 3
    else 9
  end as rank_sort,
  case c.nomination_status
    when '本指名' then 0
    when '場内' then 1
    when 'フリー' then 2
    else 9
  end as nomination_sort,
  (
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
    -- 本番DBの score は text。旧JSは null / undefined / '' / 数値0を
    -- 未登録扱いしていたが、DBから返る '0' は文字列で truthy のため除外しない。
    or c.score is null or c.score = ''
  ) as has_incomplete_profile
from public.customers c
left join (
  select
    customer_id,
    coalesce(sum(amount_spent), 0) as total_spent,
    count(*) as visit_count,
    max(visit_date) as last_visit_date,
    min(visit_date) filter (where is_first_visit = true) as first_visit_date
  from public.customer_visits
  group by customer_id
) v on v.customer_id = c.id;

revoke all on table public.customer_search_metrics from public, anon;
grant select on table public.customer_search_metrics to authenticated;
