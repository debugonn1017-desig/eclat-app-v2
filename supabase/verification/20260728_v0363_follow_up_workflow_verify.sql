-- v0.3.63 適用後の確認SQL
-- 合格条件:
--   invalid_* / inconsistent_* はすべて 0
--   rls_enabled / expected_columns_exist / expected_index_exists /
--   expected_rls_policies_exist は true

select
  count(*) filter (
    where return_visit_deadline_preset is not null
      and return_visit_deadline_preset not in (
        'tomorrow',
        'within_3_days',
        'within_1_week',
        'within_2_weeks',
        'within_1_month',
        'within_2_months',
        'within_3_months',
        'within_6_months'
      )
  ) as invalid_return_visit_preset,
  count(*) filter (
    where (return_visit_deadline_preset is null) <> (return_visit_deadline is null)
  ) as inconsistent_return_visit_deadline_pair,
  count(*) filter (
    where not (
      next_actions <@ array[
        '営業連絡',
        '関係値づくり',
        '来店斡旋',
        '同伴斡旋',
        'アフター斡旋',
        'プライベートで関係値づくり'
      ]::text[]
    )
  ) as invalid_next_actions,
  count(*) filter (
    where sales_contact_interval_days is not null
      and sales_contact_interval_days not in (1, 2, 3, 7, 14, 30)
  ) as invalid_sales_contact_interval
from public.customer_follow_ups;

select
  c.relrowsecurity as rls_enabled,
  (
    select count(*) = 4
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'customer_follow_ups'
      and column_name in (
        'return_visit_deadline',
        'return_visit_deadline_preset',
        'next_actions',
        'sales_contact_interval_days'
      )
  ) as expected_columns_exist,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'customer_follow_ups'
      and indexname = 'customer_follow_ups_return_deadline_active_idx'
  ) as expected_index_exists,
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
