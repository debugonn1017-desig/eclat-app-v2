-- v0.3.102: 黒服・オーナー専用「新人教育スケジュール表」
-- 全層の在籍キャストを対象に、確定出勤日ごとの教育・面談予定を1件管理する。

create table if not exists public.cast_training_schedules (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.profiles(id) on delete restrict,
  schedule_date date not null,
  category text not null,
  topic text not null,
  memo text not null default '',
  assigned_staff_id uuid not null references public.profiles(id) on delete restrict,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete restrict,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  updated_by uuid not null default auth.uid() references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cast_training_schedules_cast_date_key unique (cast_id, schedule_date),
  constraint cast_training_schedules_category_check
    check (category in ('phase1', 'phase2', 'phase3', 'communication')),
  constraint cast_training_schedules_topic_check
    check (char_length(btrim(topic)) between 1 and 120),
  constraint cast_training_schedules_memo_check
    check (char_length(memo) <= 5000),
  constraint cast_training_schedules_completion_check
    check (
      (is_completed and completed_at is not null and completed_by is not null)
      or
      (not is_completed and completed_at is null and completed_by is null)
    )
);

comment on table public.cast_training_schedules is
  '黒服・オーナー専用の新人教育スケジュール。全層の在籍キャストを対象とし、1キャスト・1日につき1件。';
comment on column public.cast_training_schedules.category is
  'phase1 / phase2 / phase3 / communication';
comment on column public.cast_training_schedules.assigned_staff_id is
  '実施担当の有効な黒服・オーナーアカウント';

create index if not exists cast_training_schedules_date_idx
  on public.cast_training_schedules (schedule_date, cast_id);
create index if not exists cast_training_schedules_staff_date_idx
  on public.cast_training_schedules (assigned_staff_id, schedule_date);

-- RLSを迂回した書き込みでも、対象キャスト・担当者・出勤日の整合を守る。
create or replace function public.validate_cast_training_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles target
    where target.id = new.cast_id
      and target.role = 'cast'
      and target.is_active = true
  ) then
    raise exception 'training schedule target must be an active cast' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.profiles staff
    where staff.id = new.assigned_staff_id
      and staff.role = 'admin'
      and staff.is_active = true
  ) then
    raise exception 'training schedule assignee must be an active admin' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.cast_shifts shift_row
    where shift_row.cast_id = new.cast_id
      and shift_row.shift_date = new.schedule_date
      and shift_row.status in ('出勤', '来客出勤')
  ) then
    raise exception 'training schedule requires a confirmed cast shift' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();

  if new.is_completed then
    if tg_op = 'INSERT' then
      new.completed_at := now();
      new.completed_by := new.updated_by;
    elsif not old.is_completed or old.completed_at is null then
      new.completed_at := now();
      new.completed_by := new.updated_by;
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_cast_training_schedule() from public, anon, authenticated;

drop trigger if exists cast_training_schedules_validate on public.cast_training_schedules;
create trigger cast_training_schedules_validate
before insert or update on public.cast_training_schedules
for each row execute function public.validate_cast_training_schedule();

alter table public.cast_training_schedules enable row level security;

drop policy if exists cast_training_schedules_admin_select on public.cast_training_schedules;
create policy cast_training_schedules_admin_select
  on public.cast_training_schedules
  for select
  to authenticated
  using (public.current_role() = 'admin');

drop policy if exists cast_training_schedules_admin_insert on public.cast_training_schedules;
create policy cast_training_schedules_admin_insert
  on public.cast_training_schedules
  for insert
  to authenticated
  with check (
    public.current_role() = 'admin'
    and created_by = auth.uid()
    and updated_by = auth.uid()
  );

drop policy if exists cast_training_schedules_admin_update on public.cast_training_schedules;
create policy cast_training_schedules_admin_update
  on public.cast_training_schedules
  for update
  to authenticated
  using (public.current_role() = 'admin')
  with check (
    public.current_role() = 'admin'
    and updated_by = auth.uid()
  );

drop policy if exists cast_training_schedules_admin_delete on public.cast_training_schedules;
create policy cast_training_schedules_admin_delete
  on public.cast_training_schedules
  for delete
  to authenticated
  using (public.current_role() = 'admin');

revoke all on table public.cast_training_schedules from public, anon, authenticated;
grant select, insert, update, delete on table public.cast_training_schedules to authenticated;
revoke insert, update, delete, truncate on table public.cast_training_schedules from service_role;
grant select on table public.cast_training_schedules to service_role;
