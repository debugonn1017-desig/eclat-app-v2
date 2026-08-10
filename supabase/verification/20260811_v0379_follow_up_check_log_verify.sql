-- v0.3.79 verification
-- 合格条件:
--   invalid_* / missing_* / orphan_* / *_mismatch = 0
--   *_ok / rls_enabled = true
--   public_or_anon_grants = 0

select count(*) as invalid_check_result
from public.follow_up_activity_logs
where event_type = 'check'
  and (
    check_result is null
    or check_result not in ('未読無視', '既読無視', '返信あり', '仮来店', '来店予定')
  );

select count(*) as invalid_non_check_result
from public.follow_up_activity_logs
where event_type <> 'check'
  and check_result is not null;

select count(*) as invalid_check_actor
from public.follow_up_activity_logs
where event_type = 'check'
  and voided_at is null
  and (
    actor_user_id is null
    or nullif(btrim(actor_display_name), '') is null
    or nullif(btrim(actor_role), '') is null
  );

select count(*) as missing_cycle_id
from public.customer_follow_ups
where current_cycle_id is null;

select count(*) as missing_started_log
from public.customer_follow_ups f
where not exists (
  select 1
  from public.follow_up_activity_logs l
  where l.follow_up_id = f.id
    and l.cycle_id = f.current_cycle_id
    and l.event_type = 'started'
);

select count(*) as missing_ended_log
from public.customer_follow_ups f
where f.is_active = false
  and f.removed_at is not null
  and not exists (
    select 1
    from public.follow_up_activity_logs l
    where l.follow_up_id = f.id
      and l.cycle_id = f.current_cycle_id
      and l.event_type = 'ended'
      and l.voided_at is null
  );

select count(*) as orphan_scope_mismatch
from public.follow_up_activity_logs l
join public.customer_follow_ups f on f.id = l.follow_up_id
where l.customer_id <> f.customer_id
   or l.cast_id <> f.cast_id;

select count(*) as latest_check_summary_mismatch
from public.customer_follow_ups f
left join lateral (
  select l.event_at, l.check_result
  from public.follow_up_activity_logs l
  where l.follow_up_id = f.id
    and l.event_type = 'check'
    and l.voided_at is null
  order by l.event_at desc, l.created_at desc, l.id desc
  limit 1
) latest on true
where f.last_checked_at is distinct from latest.event_at
   or f.last_check_result is distinct from latest.check_result;

select count(*) as latest_repeat_summary_mismatch
from public.customer_follow_ups f
join public.profiles p on p.id = f.cast_id
join public.customers c on c.id = f.customer_id
left join lateral (
  select max(
    (
      v.visit_date::text || ' ' ||
      coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
    )::timestamp at time zone 'Asia/Tokyo'
  ) as event_at
  from public.customer_visits v
  where v.customer_id = f.customer_id
    and v.is_planned is not true
    and (
      (
        v.visit_date::text || ' ' ||
        coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
      )::timestamp at time zone 'Asia/Tokyo'
    ) >= f.activated_at
    and (
      (
        v.visit_date::text || ' ' ||
        coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
      )::timestamp at time zone 'Asia/Tokyo'
    ) <= now()
) expected on true
where f.is_active = true
  and p.cast_name is not null
  and c.cast_name = p.cast_name
  and f.last_repeated_at is distinct from expected.event_at;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_follow_ups'
      and column_name = 'current_cycle_id'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_follow_ups'
      and column_name = 'last_checked_at'
  )
  and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_follow_ups'
      and column_name = 'last_repeated_at'
  ) as follow_up_columns_ok;

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.follow_up_activity_logs'::regclass;

select count(*) = 4 as expected_policies_ok
from pg_policies
where schemaname = 'public'
  and tablename = 'follow_up_activity_logs'
  and policyname in (
    'follow_up_activity_admin_all',
    'follow_up_activity_cast_read',
    'follow_up_activity_cast_insert',
    'follow_up_activity_cast_update_own_check'
  );

select count(*) as public_or_anon_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'follow_up_activity_logs'
  and grantee in ('PUBLIC', 'anon');

select
  has_table_privilege('authenticated', 'public.follow_up_activity_logs', 'SELECT')
  and has_table_privilege('authenticated', 'public.follow_up_activity_logs', 'INSERT')
  and has_table_privilege('authenticated', 'public.follow_up_activity_logs', 'UPDATE')
  as authenticated_grants_ok;

select
  to_regprocedure('public.prepare_follow_up_activity_log()') is not null
  and to_regprocedure('public.log_follow_up_cycle_boundary()') is not null
  and to_regprocedure('public.refresh_follow_up_check_summary(uuid)') is not null
  and to_regprocedure('public.refresh_follow_up_repeat_for_customer(bigint)') is not null
  as functions_exist_ok;

select
  to_regclass('public.follow_up_activity_logs_cycle_boundary_uidx') is not null
  and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.customer_follow_ups'::regclass
      and tgname = 'log_follow_up_cycle_boundary_trigger'
      and not tgisinternal
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = 'public.customer_visits'::regclass
      and tgname = 'sync_follow_up_repeat_from_visit_trigger'
      and not tgisinternal
  ) as indexes_and_triggers_ok;

select
  not has_function_privilege('authenticated', 'public.prepare_follow_up_activity_log()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.log_follow_up_cycle_boundary()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.refresh_follow_up_check_summary(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.refresh_follow_up_repeat_for_customer(bigint)', 'EXECUTE')
  as internal_functions_not_callable;
