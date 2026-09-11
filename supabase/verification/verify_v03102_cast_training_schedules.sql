-- v0.3.102 適用後確認。すべて true / 0 なら合格。

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'cast_training_schedules'
) as table_exists;

select count(*) = 14 as columns_ok
from information_schema.columns
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and column_name in (
    'id', 'cast_id', 'schedule_date', 'category', 'topic', 'memo',
    'assigned_staff_id', 'is_completed', 'completed_at', 'completed_by',
    'created_by', 'updated_by', 'created_at', 'updated_at'
  );

select
  count(*) filter (where conname = 'cast_training_schedules_cast_date_key' and contype = 'u') = 1
  and count(*) filter (where conname = 'cast_training_schedules_category_check' and contype = 'c') = 1
  and count(*) filter (where conname = 'cast_training_schedules_topic_check' and contype = 'c') = 1
  and count(*) filter (where conname = 'cast_training_schedules_memo_check' and contype = 'c') = 1
  and count(*) filter (where conname = 'cast_training_schedules_completion_check' and contype = 'c') = 1
  as constraints_ok
from pg_constraint
where conrelid = 'public.cast_training_schedules'::regclass;

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.cast_training_schedules'::regclass;

select
  count(*) = 4
  and count(*) filter (where policyname = 'cast_training_schedules_admin_select' and cmd = 'SELECT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_insert' and cmd = 'INSERT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_update' and cmd = 'UPDATE') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_delete' and cmd = 'DELETE') = 1
  as policies_ok
from pg_policies
where schemaname = 'public' and tablename = 'cast_training_schedules';

select count(*) as public_or_anon_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and grantee in ('PUBLIC', 'anon');

select
  has_table_privilege('authenticated', 'public.cast_training_schedules', 'SELECT')
  and has_table_privilege('authenticated', 'public.cast_training_schedules', 'INSERT')
  and has_table_privilege('authenticated', 'public.cast_training_schedules', 'UPDATE')
  and has_table_privilege('authenticated', 'public.cast_training_schedules', 'DELETE')
  as authenticated_grants_ok;

select count(*) = 0 as service_role_direct_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select
  to_regclass('public.cast_training_schedules_date_idx') is not null
  and to_regclass('public.cast_training_schedules_staff_date_idx') is not null
  as indexes_ok;

select count(*) as invalid_rows
from public.cast_training_schedules schedule
left join public.profiles cast_profile on cast_profile.id = schedule.cast_id
left join public.profiles staff_profile on staff_profile.id = schedule.assigned_staff_id
where cast_profile.id is null
   or cast_profile.role <> 'cast'
   or staff_profile.id is null
   or staff_profile.role <> 'admin'
   or schedule.category not in ('phase1', 'phase2', 'phase3', 'communication')
   or nullif(btrim(schedule.topic), '') is null
   or char_length(schedule.topic) > 120
   or char_length(schedule.memo) > 5000
   or (schedule.is_completed and (schedule.completed_at is null or schedule.completed_by is null))
   or (not schedule.is_completed and (schedule.completed_at is not null or schedule.completed_by is not null));

select coalesce(
  bool_or(config in ('search_path=', 'search_path=""')),
  false
) as trigger_search_path_empty
from pg_proc p
cross join lateral unnest(coalesce(p.proconfig, array[]::text[])) config
where p.oid = 'public.validate_cast_training_schedule()'::regprocedure;

select count(*) = 1 as trigger_exists
from pg_trigger
where tgrelid = 'public.cast_training_schedules'::regclass
  and tgname = 'cast_training_schedules_validate'
  and not tgisinternal;
