-- v0.3.103 適用後確認。すべて true / 0 なら合格。

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'cast_training_schedules'
) as table_exists;

select
  position('''出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  and position('''来客出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  and position('''希望出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  and position('''休み''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) = 0
  and position('''希望休み''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) = 0
  and position('''未定''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) = 0
  as eligible_shift_statuses_ok;

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

select count(*) as trigger_function_public_or_authenticated_execute_grants
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'validate_cast_training_schedule'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and privilege_type = 'EXECUTE';

select
  count(*) = 4
  and count(*) filter (where policyname = 'cast_training_schedules_admin_select' and cmd = 'SELECT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_insert' and cmd = 'INSERT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_update' and cmd = 'UPDATE') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_delete' and cmd = 'DELETE') = 1
  as policies_unchanged
from pg_policies
where schemaname = 'public' and tablename = 'cast_training_schedules';

select count(*) = 0 as service_role_direct_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
