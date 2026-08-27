-- v0.3.87: お客様担当黒服の権限と顧客への複数担当割当

-- 1) staff_permissions に「顧客.担当」を追加する。
alter table public.staff_permissions
  drop constraint if exists staff_permissions_permission_check;

alter table public.staff_permissions
  add constraint staff_permissions_permission_check
  check (permission in (
    '顧客.閲覧',
    '顧客.編集',
    '顧客.引継ぎ',
    '顧客.全店分析',
    '顧客.担当',
    'キャスト.閲覧',
    'キャスト.アカウント管理',
    'KPI.閲覧',
    'KPI.詳細分析',
    'シフト.閲覧',
    'シフト.管理',
    '売上.閲覧',
    '売上.入力',
    'お知らせ.閲覧',
    'お知らせ.投稿',
    'お知らせ.管理',
    'レポート.閲覧',
    'レポート.出力',
    'レポート.全店ビュー',
    '通知.送信',
    '通知.自動配信設定',
    'ランク基準.設定',
    'ノルマ.設定'
  ));

insert into public.staff_permissions (staff_id, permission, enabled)
select p.id, '顧客.担当', false
from public.profiles p
where p.role = 'admin' and p.is_owner is not true
on conflict (staff_id, permission) do nothing;

-- 2) 1人のお客様へ複数のお客様担当黒服を割り当てる中間テーブル。
create table if not exists public.customer_staff_assignments (
  id bigint generated always as identity primary key,
  customer_id bigint not null references public.customers(id) on delete cascade,
  staff_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (customer_id, staff_id)
);

create index if not exists idx_customer_staff_assignments_staff
  on public.customer_staff_assignments (staff_id, customer_id);

create index if not exists idx_customer_staff_assignments_customer
  on public.customer_staff_assignments (customer_id, staff_id);

alter table public.customer_staff_assignments enable row level security;

drop policy if exists customer_staff_assignments_admin_read
  on public.customer_staff_assignments;
create policy customer_staff_assignments_admin_read
  on public.customer_staff_assignments for select
  using (public.current_role() = 'admin');

-- キャストは自分の担当顧客に付いている黒服名をアプリ経由で確認できる。
drop policy if exists customer_staff_assignments_cast_read
  on public.customer_staff_assignments;
create policy customer_staff_assignments_cast_read
  on public.customer_staff_assignments for select
  using (
    public.current_role() = 'cast'
    and exists (
      select 1
      from public.customers c
      where c.id = customer_staff_assignments.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

-- 直接書き込みは認証ユーザーに許可しない。
revoke all on table public.customer_staff_assignments from public, anon, authenticated;
grant select on table public.customer_staff_assignments to authenticated;
grant select on table public.customer_staff_assignments to service_role;
grant usage, select on sequence public.customer_staff_assignments_id_seq to service_role;

-- 複数担当の入れ替えと旧フラグの同期は1トランザクションで確定する。
-- APIでの検証に加え、DB側でも有効な「顧客.担当」黒服だけを受け付ける。
create or replace function public.sync_customer_staff_assignments(
  p_customer_id bigint,
  p_staff_ids uuid[],
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_ids uuid[] := coalesce(p_staff_ids, array[]::uuid[]);
begin
  if cardinality(normalized_ids) > 20 then
    raise exception 'CUSTOMER_STAFF_IDS_TOO_MANY';
  end if;

  if not exists (select 1 from public.customers c where c.id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;

  if exists (
    select 1
    from unnest(normalized_ids) requested(staff_id)
    left join public.profiles p on p.id = requested.staff_id
    left join public.staff_permissions sp
      on sp.staff_id = requested.staff_id
     and sp.permission = '顧客.担当'
     and sp.enabled = true
    where p.id is null
       or p.role <> 'admin'
       or p.is_active is not true
       or sp.staff_id is null
  ) then
    raise exception 'CUSTOMER_STAFF_NOT_ELIGIBLE';
  end if;

  delete from public.customer_staff_assignments a
  where a.customer_id = p_customer_id
    and not (a.staff_id = any(normalized_ids));

  insert into public.customer_staff_assignments (
    customer_id,
    staff_id,
    assigned_by
  )
  select p_customer_id, requested.staff_id, p_actor_id
  from (select distinct unnest(normalized_ids) as staff_id) requested
  on conflict (customer_id, staff_id) do nothing;

  update public.customers
  set has_customer_staff = cardinality(normalized_ids) > 0
  where id = p_customer_id;
end;
$$;

revoke all on function public.sync_customer_staff_assignments(bigint, uuid[], uuid)
  from public, anon, authenticated;
grant execute on function public.sync_customer_staff_assignments(bigint, uuid[], uuid)
  to service_role;

comment on table public.customer_staff_assignments is
  '顧客と「顧客.担当」権限を持つ黒服の複数対複数の担当割当。店舗集計や担当キャストは変更しない。';
