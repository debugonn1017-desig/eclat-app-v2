-- v0.3.58: 基本情報不足の定義を全画面で統一
--
-- オーナー確定:
--   - 指名状況が「フリー」のお客様は判定対象外
--   - ランクが「切れた」のお客様は指名状況に関係なく判定対象外
--   - それ以外は従来の基本7項目で判定
--     お客様名 / ニックネーム / 年代 / 地域 / 既婚 / 職業 / 指名状況
--
-- SECURITY INVOKER を維持し、呼び出しユーザーのRLS可視範囲だけを判定する。

create or replace view public.customer_core_quality
with (security_invoker = true)
as
select
  c.id,
  c.customer_name,
  c.nickname,
  c.age_group,
  c.region,
  c.spouse_status,
  c.occupation,
  c.nomination_status,
  c.customer_rank,
  c.cast_name,
  lower(
    coalesce(c.customer_name, '')
    || ' '
    || coalesce(c.nickname, '')
  ) as search_text,
  quality.missing_fields,
  cardinality(quality.missing_fields) > 0 as is_incomplete
from public.customers c
cross join lateral (
  select case
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
) quality;

revoke all on table public.customer_core_quality from public, anon;
grant select on table public.customer_core_quality to authenticated;

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
  end as has_incomplete_profile
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
