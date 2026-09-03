-- v0.3.99 verification: 保存時点の指名状況スナップショット

select
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'customer_visits'
      and t.tgname = 'customer_visits_snapshot_nomination_status'
      and not t.tgisinternal
  ) as snapshot_trigger_exists;

select
  coalesce(
    pg_get_functiondef('public.snapshot_customer_visit_nomination_status()'::regprocedure)
      not ilike '%nomination_history%'
    and pg_get_functiondef('public.snapshot_customer_visit_nomination_status()'::regprocedure)
      ilike '%from public.customers%',
    false
  ) as trigger_uses_save_time_customer_status;

select
  coalesce(
    (
      select p.proconfig @> array['search_path=']::text[]
        or p.proconfig @> array['search_path=""']::text[]
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = 'snapshot_customer_visit_nomination_status'
    ),
    false
  ) as trigger_search_path_empty;

select count(*) as missing_actual_visit_snapshots
from public.customer_visits
where is_planned is not true
  and nomination_status_at_visit is null;

select count(*) as invalid_visit_snapshots
from public.customer_visits
where nomination_status_at_visit is not null
  and nomination_status_at_visit not in ('フリー', '場内', '本指名');

with save_time_status as (
  select
    v.id,
    v.nomination_status_at_visit,
    latest.new_status
  from public.customer_visits v
  cross join lateral (
    select nh.new_status
    from public.nomination_history nh
    where nh.customer_id = v.customer_id
      and nh.changed_at <= v.created_at
      and nh.new_status in ('フリー', '場内', '本指名')
    order by nh.changed_at desc, nh.id desc
    limit 1
  ) latest
  where v.created_at >= timestamptz '2026-08-29 00:00:00+09:00'
    and v.is_planned is not true
)
select count(*) as save_time_snapshot_mismatches
from save_time_status
where nomination_status_at_visit is distinct from new_status;

select count(*) as public_or_user_execute_grants
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'snapshot_customer_visit_nomination_status'
  and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
  and privilege_type = 'EXECUTE';
