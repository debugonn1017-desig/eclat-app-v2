-- v0.3.56-A 本番RLS 適用前後確認（読み取り専用）
--
-- 1. migration適用前に「現在のポリシー一覧」を実行し、結果を保存する。
-- 2. 20260727_daily_workflow_privacy.sql を適用する。
-- 3. 同じ一覧と「危険・不足・想定外チェック」を再実行する。
-- 4. 適用後は危険・不足・想定外チェックがすべて0行であることを確認する。

-- ─── 現在のポリシー一覧 ─────────────────────────────────────
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where
  (
    schemaname = 'public'
    and tablename in (
      'profiles',
      'customers',
      'customer_visits',
      'customer_contacts',
      'customer_bottles',
      'customer_memos',
      'planned_visits',
      'nomination_history',
      'customer_follow_ups'
    )
  )
  or (
    schemaname = 'storage'
    and tablename = 'objects'
    and policyname like 'customer_photos_%'
  )
order by schemaname, tablename, policyname;

-- ─── RLS有効確認（適用後はすべて true）──────────────────────
select
  n.nspname as schemaname,
  c.relname as tablename,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles',
    'customers',
    'customer_visits',
    'customer_contacts',
    'customer_bottles',
    'customer_memos',
    'planned_visits',
    'nomination_history',
    'customer_follow_ups'
  )
order by c.relname;

-- ─── 危険な旧ポリシー確認（適用後は0行）─────────────────────
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where
  (
    schemaname = 'public'
    and policyname in (
      'allow_insert_for_all_users',
      'contacts_all_access',
      'bottles_all_access'
    )
  )
  or (
    schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'customer_photos_authenticated_all'
  )
  or (
    schemaname = 'public'
    and tablename in (
      'profiles',
      'customers',
      'customer_visits',
      'customer_contacts',
      'customer_bottles',
      'customer_memos',
      'planned_visits',
      'nomination_history',
      'customer_follow_ups'
    )
    and (
      coalesce(qual, '') = 'true'
      or coalesce(with_check, '') = 'true'
    )
  )
order by schemaname, tablename, policyname;

-- ─── 必須ポリシーの不足・想定外確認（適用後は0行）────────────
with expected(schemaname, tablename, policyname) as (
  values
    ('public', 'profiles', 'profiles_self_read'),
    ('public', 'profiles', 'profiles_admin_read'),
    ('public', 'profiles', 'profiles_admin_write'),
    ('public', 'customers', 'customers_admin_all'),
    ('public', 'customers', 'customers_cast_read'),
    ('public', 'customers', 'customers_cast_update'),
    ('public', 'customers', 'customers_cast_insert'),
    ('public', 'customer_visits', 'visits_admin_read'),
    ('public', 'customer_visits', 'visits_admin_perm_write'),
    ('public', 'customer_visits', 'visits_admin_perm_update'),
    ('public', 'customer_visits', 'visits_admin_perm_delete'),
    ('public', 'customer_visits', 'visits_cast_all'),
    ('public', 'customer_contacts', 'contacts_admin_all'),
    ('public', 'customer_contacts', 'contacts_cast_own'),
    ('public', 'customer_bottles', 'bottles_admin_all'),
    ('public', 'customer_bottles', 'bottles_cast_own'),
    ('public', 'customer_memos', 'memos_admin_all'),
    ('public', 'customer_memos', 'memos_cast_all'),
    ('public', 'planned_visits', 'planned_visits_admin_all'),
    ('public', 'planned_visits', 'planned_visits_cast_own'),
    ('public', 'nomination_history', 'nomination_history_admin_all'),
    ('public', 'nomination_history', 'nomination_history_cast_own'),
    ('public', 'customer_follow_ups', 'follow_ups_admin_all'),
    ('public', 'customer_follow_ups', 'follow_ups_cast_read'),
    ('public', 'customer_follow_ups', 'follow_ups_cast_insert'),
    ('public', 'customer_follow_ups', 'follow_ups_cast_update'),
    ('storage', 'objects', 'customer_photos_admin_all'),
    ('storage', 'objects', 'customer_photos_cast_own')
),
actual as (
  select schemaname, tablename, policyname
  from pg_policies
  where
    (
      schemaname = 'public'
      and tablename in (
        'profiles',
        'customers',
        'customer_visits',
        'customer_contacts',
        'customer_bottles',
        'customer_memos',
        'planned_visits',
        'nomination_history',
        'customer_follow_ups'
      )
    )
    or (
      schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'customer_photos_%'
    )
)
select
  '不足' as issue,
  e.schemaname,
  e.tablename,
  e.policyname
from expected e
left join actual a
  on a.schemaname = e.schemaname
  and a.tablename = e.tablename
  and a.policyname = e.policyname
where a.policyname is null

union all

select
  '想定外' as issue,
  a.schemaname,
  a.tablename,
  a.policyname
from actual a
left join expected e
  on e.schemaname = a.schemaname
  and e.tablename = a.tablename
  and e.policyname = a.policyname
where e.policyname is null
order by schemaname, tablename, policyname;
