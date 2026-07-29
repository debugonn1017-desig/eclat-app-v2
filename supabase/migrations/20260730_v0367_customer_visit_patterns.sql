-- v0.3.67: 顧客カード用の来店曜日・時間帯傾向
--
-- 目的:
--   - 直近10回の実来店だけから、曜日上位2件と時間帯傾向を一括集計する
--   - 20→21→22→23→0時台の順で「早い時間の来店実績」を優先できるようにする
--   - 顧客検索はDBで全件を並び替えた後にページングする
--
-- 注意:
--   - 予定(is_planned=true)は除外する
--   - 0円の実来店は来店傾向なので含める
--   - 0時台の曜日は店舗営業日の visit_date をそのまま使う
--   - SECURITY INVOKER により、既存 customer_visits / customers RLS を維持する

create or replace view public.customer_visit_patterns
with (security_invoker = true)
as
with ranked_visits as (
  select
    v.id,
    v.customer_id,
    v.visit_date,
    v.visit_time,
    row_number() over (
      partition by v.customer_id
      order by v.visit_date desc, v.visit_time desc nulls last, v.id desc
    ) as recent_number
  from public.customer_visits v
  where v.is_planned is not true
),
recent_visits as (
  select
    id,
    customer_id,
    visit_date,
    visit_time,
    extract(isodow from visit_date)::integer as weekday_code,
    case
      when extract(hour from visit_time)::integer in (20, 21, 22, 23, 0)
        then extract(hour from visit_time)::integer
      else null
    end as visit_hour
  from ranked_visits
  where recent_number <= 10
),
sample_counts as (
  select customer_id, count(*) as sample_visit_count
  from recent_visits
  group by customer_id
),
weekday_stats as (
  select
    customer_id,
    weekday_code,
    count(*) as weekday_count,
    max(visit_date) as weekday_last_visit_date
  from recent_visits
  group by customer_id, weekday_code
),
weekday_ranked as (
  select
    customer_id,
    weekday_code,
    row_number() over (
      partition by customer_id
      order by weekday_count desc, weekday_last_visit_date desc, weekday_code asc
    ) as weekday_number
  from weekday_stats
),
weekday_arrays as (
  select
    customer_id,
    array_agg(weekday_code order by weekday_number)::integer[] as weekday_codes
  from weekday_ranked
  where weekday_number <= 2
  group by customer_id
),
hour_stats as (
  select
    customer_id,
    visit_hour,
    count(*) as hour_count,
    max(visit_date) as hour_last_visit_date
  from recent_visits
  where visit_hour is not null
  group by customer_id, visit_hour
),
early_hours as (
  select distinct on (customer_id)
    customer_id,
    visit_hour as early_hour,
    hour_count as early_hour_count,
    hour_last_visit_date as early_hour_last_visit_date
  from hour_stats
  order by
    customer_id,
    case visit_hour
      when 20 then 0
      when 21 then 1
      when 22 then 2
      when 23 then 3
      when 0 then 4
      else 5
    end
),
usual_hours as (
  select distinct on (customer_id)
    customer_id,
    visit_hour as usual_hour,
    hour_count as usual_hour_count
  from hour_stats
  order by
    customer_id,
    hour_count desc,
    hour_last_visit_date desc,
    case visit_hour
      when 20 then 0
      when 21 then 1
      when 22 then 2
      when 23 then 3
      when 0 then 4
      else 5
    end
)
select
  counts.customer_id,
  counts.sample_visit_count,
  coalesce(weekdays.weekday_codes, array[]::integer[]) as weekday_codes,
  early.early_hour,
  coalesce(early.early_hour_count, 0) as early_hour_count,
  early.early_hour_last_visit_date,
  usual.usual_hour,
  coalesce(usual.usual_hour_count, 0) as usual_hour_count,
  case early.early_hour
    when 20 then 0
    when 21 then 1
    when 22 then 2
    when 23 then 3
    when 0 then 4
    else 5
  end as early_time_sort
from sample_counts counts
left join weekday_arrays weekdays on weekdays.customer_id = counts.customer_id
left join early_hours early on early.customer_id = counts.customer_id
left join usual_hours usual on usual.customer_id = counts.customer_id;

revoke all on table public.customer_visit_patterns from public, anon;
grant select on table public.customer_visit_patterns to authenticated;

-- v0.3.58 の既存列・既存ロジックをそのまま維持し、
-- 来店傾向列だけを末尾へ追加する。
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
  case
    when c.nomination_status = 'フリー'
      or c.customer_rank = '切れた'
      then false
    else (
      nullif(btrim(c.customer_name), '') is null
      or nullif(btrim(c.nickname), '') is null
      or nullif(btrim(c.age_group), '') is null
      or nullif(btrim(c.region), '') is null
      or nullif(btrim(c.spouse_status), '') is null
      or nullif(btrim(c.occupation), '') is null
      or nullif(btrim(c.nomination_status), '') is null
    )
  end as has_incomplete_profile,
  coalesce(pattern.sample_visit_count, 0) as metric_pattern_visit_count,
  coalesce(pattern.weekday_codes, array[]::integer[]) as metric_pattern_weekday_codes,
  pattern.early_hour as metric_pattern_early_hour,
  coalesce(pattern.early_hour_count, 0) as metric_pattern_early_hour_count,
  pattern.early_hour_last_visit_date as metric_pattern_early_last_visit_date,
  pattern.usual_hour as metric_pattern_usual_hour,
  coalesce(pattern.usual_hour_count, 0) as metric_pattern_usual_hour_count,
  coalesce(pattern.early_time_sort, 5) as metric_early_time_sort
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
) v on v.customer_id = c.id
left join public.customer_visit_patterns pattern on pattern.customer_id = c.id;

revoke all on table public.customer_search_metrics from public, anon;
grant select on table public.customer_search_metrics to authenticated;
