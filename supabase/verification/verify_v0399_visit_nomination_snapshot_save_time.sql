-- v0.3.99 verification: 保存時点の指名状況スナップショット
-- 合格条件: boolean はすべて true、件数はすべて 0。

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
), snapshot_function as (
  select
    pg_get_functiondef(p.oid) as definition,
    p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'snapshot_customer_visit_nomination_status'
)
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
  ) as snapshot_trigger_exists,
  coalesce((
    select definition not ilike '%nomination_history%'
      and definition ilike '%from public.customers%'
    from snapshot_function
  ), false) as trigger_uses_save_time_customer_status,
  coalesce((
    select bool_or(config in ('search_path=', 'search_path=""'))
    from snapshot_function
    cross join lateral unnest(coalesce(proconfig, array[]::text[])) config
  ), false) as trigger_search_path_empty,
  (
    select count(*)
    from save_time_status
    where nomination_status_at_visit is null
  ) as missing_reconstructable_visit_snapshots,
  (
    select count(*)
    from public.customer_visits
    where nomination_status_at_visit is not null
      and nomination_status_at_visit not in ('フリー', '場内', '本指名')
  ) as invalid_visit_snapshots,
  (
    select count(*)
    from save_time_status
    where nomination_status_at_visit is distinct from new_status
  ) as save_time_snapshot_mismatches,
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'snapshot_customer_visit_nomination_status'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and privilege_type = 'EXECUTE'
  ) as public_or_user_execute_grants;
