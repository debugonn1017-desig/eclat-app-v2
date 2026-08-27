-- v0.3.87 適用後確認。すべて true / 0 なら合格。
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'customer_staff_assignments'
) as assignment_table_exists;

select exists (
  select 1 from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  where t.relname = 'staff_permissions'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%顧客.担当%'
) as customer_staff_permission_allowed;

select relrowsecurity as assignment_rls_enabled
from pg_class
where oid = 'public.customer_staff_assignments'::regclass;

select count(*) = 2 as assignment_select_policies_ok
from pg_policies
where schemaname = 'public'
  and tablename = 'customer_staff_assignments'
  and cmd = 'SELECT';

select count(*) = 1 as admin_read_policy_ok
from pg_policies
where schemaname = 'public'
  and tablename = 'customer_staff_assignments'
  and policyname = 'customer_staff_assignments_admin_read'
  and cmd = 'SELECT'
  and qual like '%current_role()%admin%';

select count(*) = 1 as cast_scoped_read_policy_ok
from pg_policies
where schemaname = 'public'
  and tablename = 'customer_staff_assignments'
  and policyname = 'customer_staff_assignments_cast_read'
  and cmd = 'SELECT'
  and qual like '%current_cast_name()%';

select count(*) = 0 as authenticated_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'customer_staff_assignments'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select count(*) = 0 as service_role_direct_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'customer_staff_assignments'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select exists (
  select 1
  from information_schema.routines
  where routine_schema = 'public'
    and routine_name = 'sync_customer_staff_assignments'
) as atomic_sync_function_exists;

select security_type = 'DEFINER' as atomic_sync_security_definer
from information_schema.routines
where routine_schema = 'public'
  and routine_name = 'sync_customer_staff_assignments';

select count(*) = 1 as service_role_execute_grant_ok
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'sync_customer_staff_assignments'
  and grantee = 'service_role'
  and privilege_type = 'EXECUTE';

select count(*) = 0 as unauthorised_execute_grants_zero
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name = 'sync_customer_staff_assignments'
  and grantee in ('PUBLIC', 'anon', 'authenticated')
  and privilege_type = 'EXECUTE';

select count(*) as invalid_assignment_rows
from public.customer_staff_assignments a
left join public.profiles p on p.id = a.staff_id
left join public.staff_permissions sp
  on sp.staff_id = a.staff_id
 and sp.permission = '顧客.担当'
 and sp.enabled = true
where p.id is null
   or p.role <> 'admin'
   or p.is_active is not true
   or sp.staff_id is null;
