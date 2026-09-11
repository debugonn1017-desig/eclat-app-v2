-- v0.3.104 適用後確認。すべて true / 0 なら合格。

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'cast_training_schedules'
) as table_exists;

select count(*) = 1
  and bool_and(position('cast_mt' in pg_get_constraintdef(oid)) > 0)
  and bool_and(position('communication' in pg_get_constraintdef(oid)) > 0)
  and bool_and(position('phase1' in pg_get_constraintdef(oid)) > 0)
  and bool_and(position('phase2' in pg_get_constraintdef(oid)) > 0)
  and bool_and(position('phase3' in pg_get_constraintdef(oid)) > 0)
  as category_constraint_ok
from pg_constraint
where conrelid = 'public.cast_training_schedules'::regclass
  and conname = 'cast_training_schedules_category_check'
  and contype = 'c';

select count(*) as invalid_categories
from public.cast_training_schedules
where category not in ('phase1', 'phase2', 'phase3', 'communication', 'cast_mt');

select
  position('''出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  and position('''来客出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  and position('''希望出勤''' in pg_get_functiondef('public.validate_cast_training_schedule()'::regprocedure)) > 0
  as eligible_shift_statuses_unchanged;

select count(*) = 1 as validation_trigger_exists
from pg_trigger
where tgrelid = 'public.cast_training_schedules'::regclass
  and tgname = 'cast_training_schedules_validate'
  and not tgisinternal;

select
  count(*) = 4
  and count(*) filter (where policyname = 'cast_training_schedules_admin_select' and cmd = 'SELECT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_insert' and cmd = 'INSERT') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_update' and cmd = 'UPDATE') = 1
  and count(*) filter (where policyname = 'cast_training_schedules_admin_delete' and cmd = 'DELETE') = 1
  as policies_unchanged
from pg_policies
where schemaname = 'public' and tablename = 'cast_training_schedules';

select count(*) as public_or_anon_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and grantee in ('PUBLIC', 'anon');

select count(*) = 0 as service_role_direct_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_training_schedules'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
