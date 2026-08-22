-- v0.3.81 適用後確認

select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = 'training_start_date'
    and data_type = 'date'
) as training_start_date_exists;

-- 既存プロフィールの件数が変わっていないことを確認する補助値。
select
  count(*) filter (where role = 'cast') as cast_count,
  count(*) filter (where role = 'cast' and cast_tier = '新人層') as new_cast_count,
  count(*) filter (where role = 'cast' and cast_tier = '新人層' and training_start_date is not null) as configured_new_cast_count
from public.profiles;

-- 本機能は既存 profiles RLS をそのまま利用する。
select relrowsecurity as profiles_rls_enabled
from pg_class
where oid = 'public.profiles'::regclass;
