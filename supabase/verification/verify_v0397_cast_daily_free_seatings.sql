-- v0.3.97 適用後確認。すべて true / 0 なら合格。

select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'cast_daily_free_seatings'
) as table_exists;

select count(*) = 1 as unique_cast_date_ok
from pg_constraint
where conrelid = 'public.cast_daily_free_seatings'::regclass
  and conname = 'cast_daily_free_seatings_cast_date_key'
  and contype = 'u';

select count(*) = 1 as count_constraint_ok
from pg_constraint
where conrelid = 'public.cast_daily_free_seatings'::regclass
  and conname = 'cast_daily_free_seatings_count_check'
  and contype = 'c';

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.cast_daily_free_seatings'::regclass;

select
  count(*) = 4
  and count(*) filter (where policyname = 'cast_daily_free_seatings_admin_read' and cmd = 'SELECT') = 1
  and count(*) filter (where policyname = 'cast_daily_free_seatings_sales_insert' and cmd = 'INSERT') = 1
  and count(*) filter (where policyname = 'cast_daily_free_seatings_sales_update' and cmd = 'UPDATE') = 1
  and count(*) filter (where policyname = 'cast_daily_free_seatings_sales_delete' and cmd = 'DELETE') = 1
  as policies_ok
from pg_policies
where schemaname = 'public' and tablename = 'cast_daily_free_seatings';

select count(*) as public_or_anon_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_daily_free_seatings'
  and grantee in ('PUBLIC', 'anon');

select
  has_table_privilege('authenticated', 'public.cast_daily_free_seatings', 'SELECT')
  and has_table_privilege('authenticated', 'public.cast_daily_free_seatings', 'INSERT')
  and has_table_privilege('authenticated', 'public.cast_daily_free_seatings', 'UPDATE')
  and has_table_privilege('authenticated', 'public.cast_daily_free_seatings', 'DELETE')
  as authenticated_grants_ok;

select count(*) = 0 as service_role_direct_write_grants_zero
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_daily_free_seatings'
  and grantee = 'service_role'
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select to_regclass('public.cast_daily_free_seatings_date_idx') is not null as date_index_ok;

select count(*) as invalid_rows
from public.cast_daily_free_seatings row
left join public.profiles cast_profile on cast_profile.id = row.cast_id
where row.seating_count < 0
   or row.seating_count > 999
   or cast_profile.id is null
   or cast_profile.role <> 'cast';

select coalesce(
  bool_or(config in ('search_path=', 'search_path=""')),
  false
) as trigger_search_path_empty
from pg_proc p
cross join lateral unnest(coalesce(p.proconfig, array[]::text[])) config
where p.oid = 'public.set_cast_daily_free_seatings_updated_at()'::regprocedure;
