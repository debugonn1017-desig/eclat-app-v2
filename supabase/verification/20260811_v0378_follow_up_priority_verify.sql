-- v0.3.78 適用後の確認SQL
-- 合格条件:
--   invalid_priority / null_priority は 0
--   column_definition_ok / constraint_exists / rls_enabled /
--   expected_rls_policies_exist は true

select
  count(*) filter (
    where follow_up_priority not in ('最優先', '高', '中', '低')
  ) as invalid_priority,
  count(*) filter (where follow_up_priority is null) as null_priority
from public.customer_follow_ups;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_follow_ups'
      and column_name = 'follow_up_priority'
      and data_type = 'text'
      and is_nullable = 'NO'
      and column_default like '%中%'
  ) as column_definition_ok,
  exists (
    select 1
    from pg_constraint constraint_definition
    join pg_class table_definition on table_definition.oid = constraint_definition.conrelid
    join pg_namespace schema_definition on schema_definition.oid = table_definition.relnamespace
    where schema_definition.nspname = 'public'
      and table_definition.relname = 'customer_follow_ups'
      and constraint_definition.conname = 'customer_follow_ups_follow_up_priority_check'
  ) as constraint_exists,
  c.relrowsecurity as rls_enabled,
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_follow_ups'
      and policyname in (
        'follow_ups_admin_all',
        'follow_ups_cast_read',
        'follow_ups_cast_insert',
        'follow_ups_cast_update'
      )
  ) as expected_rls_policies_exist
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'customer_follow_ups';
