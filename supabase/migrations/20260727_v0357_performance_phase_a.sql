-- v0.3.57-A: 日常画面の全件転送をDB集計・サーバーページングへ置換
--
-- SECURITY INVOKER を明示し、呼び出しユーザーのRLS可視範囲をそのまま使う。
-- キャストは自分の担当分だけ、管理者は既存RLSの範囲だけが集計対象になる。

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
  select array_remove(array[
    case when nullif(btrim(c.customer_name), '') is null then 'customer_name' end,
    case when nullif(btrim(c.nickname), '') is null then 'nickname' end,
    case when nullif(btrim(c.age_group), '') is null then 'age_group' end,
    case when nullif(btrim(c.region), '') is null then 'region' end,
    case when nullif(btrim(c.spouse_status), '') is null then 'spouse_status' end,
    case when nullif(btrim(c.occupation), '') is null then 'occupation' end,
    case when nullif(btrim(c.nomination_status), '') is null then 'nomination_status' end
  ]::text[], null) as missing_fields
) quality;

revoke all on table public.customer_core_quality from public, anon;
grant select on table public.customer_core_quality to authenticated;

create or replace function public.get_customer_core_quality_counts()
returns table (
  total_customers bigint,
  incomplete_customers bigint,
  missing_counts jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) as total_customers,
    count(*) filter (where q.is_incomplete) as incomplete_customers,
    jsonb_build_object(
      'customer_name',
        count(*) filter (where q.missing_fields @> array['customer_name']::text[]),
      'nickname',
        count(*) filter (where q.missing_fields @> array['nickname']::text[]),
      'age_group',
        count(*) filter (where q.missing_fields @> array['age_group']::text[]),
      'region',
        count(*) filter (where q.missing_fields @> array['region']::text[]),
      'spouse_status',
        count(*) filter (where q.missing_fields @> array['spouse_status']::text[]),
      'occupation',
        count(*) filter (where q.missing_fields @> array['occupation']::text[]),
      'nomination_status',
        count(*) filter (where q.missing_fields @> array['nomination_status']::text[])
    ) as missing_counts
  from public.customer_core_quality q
$$;

revoke all on function public.get_customer_core_quality_counts() from public, anon;
grant execute on function public.get_customer_core_quality_counts() to authenticated;

create or replace function public.get_daily_workflow_summary(p_today date)
returns table (
  today_planned_visits bigint,
  active_follow_ups bigint,
  due_follow_ups bigint,
  incomplete_customers bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    (
      select count(*)
      from public.planned_visits p
      where p.status = '予定'
        and p.planned_date = p_today
    ) as today_planned_visits,
    (
      select count(*)
      from public.customer_follow_ups f
      where f.is_active = true
    ) as active_follow_ups,
    (
      select count(*)
      from public.customer_follow_ups f
      where f.is_active = true
        and f.next_contact_date is not null
        and f.next_contact_date <= p_today
    ) as due_follow_ups,
    (
      select count(*)
      from public.customer_core_quality q
      where q.is_incomplete = true
    ) as incomplete_customers
$$;

revoke all on function public.get_daily_workflow_summary(date) from public, anon;
grant execute on function public.get_daily_workflow_summary(date) to authenticated;

-- ホームの「今日まで」と「今日の予定」を少ない読み取りで数えられるようにする。
create index if not exists idx_follow_ups_active_due
  on public.customer_follow_ups(next_contact_date)
  where is_active = true;

create index if not exists idx_planned_visits_date_status
  on public.planned_visits(planned_date, status);
