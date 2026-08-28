-- v0.3.92 合格条件:
-- column_exists / constraint_exists / trigger_exists / index_exists = true
-- invalid_values / missing_snapshots = 0

select exists (
  select 1 from information_schema.columns
  where table_schema = 'public'
    and table_name = 'customer_visits'
    and column_name = 'nomination_status_at_visit'
    and data_type = 'text'
) as column_exists;

select exists (
  select 1 from pg_constraint
  where conrelid = 'public.customer_visits'::regclass
    and conname = 'customer_visits_nomination_status_at_visit_check'
) as constraint_exists;

select exists (
  select 1 from pg_trigger
  where tgrelid = 'public.customer_visits'::regclass
    and tgname = 'customer_visits_snapshot_nomination_status'
    and not tgisinternal
) as trigger_exists;

select exists (
  select 1 from pg_indexes
  where schemaname = 'public'
    and tablename = 'customer_visits'
    and indexname = 'idx_customer_visits_nomination_date'
) as index_exists;

select count(*) as invalid_values
from public.customer_visits
where nomination_status_at_visit is not null
  and nomination_status_at_visit not in ('フリー', '場内', '本指名');

select count(*) as missing_snapshots
from public.customer_visits v
join public.customers c on c.id = v.customer_id
where v.nomination_status_at_visit is null
  and c.nomination_status is not null;

select proconfig = array['search_path='] as trigger_search_path_empty
from pg_proc
where oid = 'public.snapshot_customer_visit_nomination_status()'::regprocedure;
