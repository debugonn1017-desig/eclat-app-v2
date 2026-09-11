-- v0.3.105 verification: 来店指名区分とボウズ判定の整合
-- 合格条件: boolean はすべて true、件数はすべて 0。

with function_meta as (
  select
    p.oid,
    p.prosecdef,
    p.proconfig,
    pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sync_recent_visit_nomination_from_history'
), recent_conversion_snapshots as (
  select
    nh.id as history_id,
    latest_visit.nomination_status_at_visit
  from public.nomination_history nh
  cross join lateral (
    select v.id, v.nomination_status_at_visit
    from public.customer_visits v
    where v.customer_id = nh.customer_id
      and v.is_planned is not true
      and v.created_at >= timestamptz '2026-08-29 00:00:00+09:00'
      and v.created_at <= nh.changed_at
      and v.created_at >= nh.changed_at - interval '10 minutes'
    order by v.created_at desc, v.id desc
    limit 1
  ) latest_visit
  where nh.old_status = '場内'
    and nh.new_status = '本指名'
    and latest_visit.nomination_status_at_visit = '場内'
)
select
  exists (select 1 from function_meta) as sync_function_exists,
  coalesce((select prosecdef from function_meta), false) as sync_function_security_definer,
  coalesce((
    select bool_or(config in ('search_path=', 'search_path=""'))
    from function_meta
    cross join lateral unnest(coalesce(proconfig, array[]::text[])) config
  ), false) as sync_function_search_path_empty,
  coalesce((
    select definition ilike '%old_status = ''場内''%'
      and definition ilike '%new_status = ''本指名''%'
      and (definition ilike '%10 minutes%' or definition ilike '%00:10:00%')
      and definition ilike '%nomination_status_at_visit = ''本指名''%'
    from function_meta
  ), false) as sync_function_definition_ok,
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'nomination_history'
      and t.tgname = 'nomination_history_sync_recent_visit_nomination'
      and not t.tgisinternal
  ) as sync_trigger_exists,
  (
    select count(*)
    from recent_conversion_snapshots
  ) as unfixed_recent_banai_snapshots,
  (
    select count(*)
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'sync_recent_visit_nomination_from_history'
      and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      and privilege_type = 'EXECUTE'
  ) as public_or_user_execute_grants;
