-- v0.3.83 適用後確認
-- 合格条件:
--   invalid_* / public_or_anon_grants = 0
--   *_ok / rls_enabled = true

select count(*) as invalid_required_values
from public.cast_meeting_logs
where nullif(btrim(title), '') is null
   or char_length(btrim(title)) > 120
   or nullif(btrim(staff_name), '') is null
   or char_length(btrim(staff_name)) > 80
   or nullif(btrim(transcript), '') is null
   or char_length(btrim(transcript)) > 100000
   or nullif(btrim(created_by_name), '') is null
   or char_length(btrim(created_by_name)) > 120;

select count(*) as invalid_target_cast
from public.cast_meeting_logs log
left join public.profiles target on target.id = log.cast_id
where target.id is null or target.role <> 'cast';

select count(*) as invalid_creator
from public.cast_meeting_logs log
left join public.profiles creator on creator.id = log.created_by
where creator.id is null or creator.role <> 'admin';

select relrowsecurity as rls_enabled
from pg_class
where oid = 'public.cast_meeting_logs'::regclass;

select
  count(*) = 2
  and count(*) filter (where policyname = 'cast_meeting_logs_admin_select' and cmd = 'SELECT') = 1
  and count(*) filter (where policyname = 'cast_meeting_logs_admin_insert' and cmd = 'INSERT') = 1
  as policies_ok
from pg_policies
where schemaname = 'public'
  and tablename = 'cast_meeting_logs';

select count(*) as public_or_anon_grants
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'cast_meeting_logs'
  and grantee in ('PUBLIC', 'anon');

select
  has_table_privilege('authenticated', 'public.cast_meeting_logs', 'SELECT')
  and has_table_privilege('authenticated', 'public.cast_meeting_logs', 'INSERT')
  and not has_table_privilege('authenticated', 'public.cast_meeting_logs', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.cast_meeting_logs', 'DELETE')
  as authenticated_grants_ok;

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cast_meeting_logs'
      and column_name = 'meeting_date'
      and data_type = 'date'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cast_meeting_logs'
      and column_name = 'transcript'
      and data_type = 'text'
  )
  and exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cast_meeting_logs'
      and column_name = 'created_by'
      and data_type = 'uuid'
  ) as columns_ok;

select to_regclass('public.cast_meeting_logs_cast_timeline_idx') is not null
  as timeline_index_ok;
