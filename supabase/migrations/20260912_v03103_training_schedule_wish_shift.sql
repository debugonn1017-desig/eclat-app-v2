-- v0.3.103: 新人教育スケジュールを「希望出勤」にも設定できるようにする。
-- APIだけでなくDB triggerの再検証も同じ3ステータスに揃える。

comment on table public.cast_training_schedules is
  '黒服・オーナー専用。出勤・来客出勤・希望出勤日のキャスト教育・面談予定。';

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
      and shift_row.status in ('出勤', '来客出勤', '希望出勤')
  ) then
    raise exception 'training schedule requires an eligible cast shift' using errcode = '23514';
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
