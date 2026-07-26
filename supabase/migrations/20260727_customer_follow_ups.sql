-- v0.3.54-B: 追いかけリスト
--
-- 顧客ランク・指名状況・KPI・CUSTOMERS 分類とは独立した手動管理テーブル。
-- 「連絡した」だけでは is_active を変えず、利用者が明示的に外すまで一覧に残す。

create table if not exists public.customer_follow_ups (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customers(id) on delete cascade,
  cast_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  next_contact_date date,
  is_active boolean not null default true,
  last_contacted_at timestamptz,
  last_contacted_by uuid references public.profiles(id) on delete set null,
  -- 追加したスタッフが将来削除されても追いかけ履歴を残せるよう、監査者FKは nullable。
  added_by uuid references public.profiles(id) on delete set null,
  activated_at timestamptz not null default now(),
  activated_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, cast_id)
);

create index if not exists customer_follow_ups_cast_active_idx
  on public.customer_follow_ups(cast_id, is_active, next_contact_date);

create index if not exists customer_follow_ups_customer_idx
  on public.customer_follow_ups(customer_id);

alter table public.customer_follow_ups enable row level security;

drop policy if exists "follow_ups_admin_all" on public.customer_follow_ups;
create policy "follow_ups_admin_all"
  on public.customer_follow_ups for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "follow_ups_cast_read" on public.customer_follow_ups;
create policy "follow_ups_cast_read"
  on public.customer_follow_ups for select
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = customer_follow_ups.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

drop policy if exists "follow_ups_cast_insert" on public.customer_follow_ups;
create policy "follow_ups_cast_insert"
  on public.customer_follow_ups for insert
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and added_by = auth.uid()
    and activated_by = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = customer_follow_ups.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

drop policy if exists "follow_ups_cast_update" on public.customer_follow_ups;
create policy "follow_ups_cast_update"
  on public.customer_follow_ups for update
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = customer_follow_ups.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = customer_follow_ups.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

drop trigger if exists customer_follow_ups_updated_at on public.customer_follow_ups;
create trigger customer_follow_ups_updated_at
  before update on public.customer_follow_ups
  for each row execute function public.set_updated_at();

-- キャスト本人が毎日通知を止めたい場合だけ false を保存する。
-- レコードが無い場合は true（スマホ通知を購読しているキャストへ配信）。
create table if not exists public.follow_up_notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.follow_up_notification_preferences enable row level security;

drop policy if exists "follow_up_preferences_self" on public.follow_up_notification_preferences;
create policy "follow_up_preferences_self"
  on public.follow_up_notification_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "follow_up_preferences_admin_read" on public.follow_up_notification_preferences;
create policy "follow_up_preferences_admin_read"
  on public.follow_up_notification_preferences for select
  using (public.current_role() = 'admin');

drop trigger if exists follow_up_notification_preferences_updated_at
  on public.follow_up_notification_preferences;
create trigger follow_up_notification_preferences_updated_at
  before update on public.follow_up_notification_preferences
  for each row execute function public.set_updated_at();

-- Cron の多重実行で同じ日に同じキャストへ二重配信しないための記録。
-- RLS を有効化し、service_role 以外にはポリシーを与えない。
create table if not exists public.follow_up_reminder_log (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  active_count integer not null check (active_count >= 0),
  delivered_count integer not null default 0 check (delivered_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  created_at timestamptz not null default now(),
  unique (cast_id, reminder_date)
);

alter table public.follow_up_reminder_log enable row level security;
