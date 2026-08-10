-- v0.3.79: 追いかけ担当者チェック・追いかけ期間・実来店連携
--
-- 方針:
--   - 担当者チェックは監査ログとして追記し、確認したログインアカウントを自動保存する。
--   - 来店情報はログへ複製せず customer_visits を参照する。
--   - 追いかけを再開するたびに current_cycle_id を更新し、期間ごとにログを分離する。
--   - 実来店は current cycle の開始後だけ last_repeated_at へ反映する。

alter table public.customer_follow_ups
  add column if not exists current_cycle_id uuid not null default gen_random_uuid(),
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_check_result text,
  add column if not exists last_repeated_at timestamptz,
  add column if not exists return_visit_configured_at timestamptz,
  add column if not exists sales_contact_configured_at timestamptz;

update public.customer_follow_ups
set return_visit_configured_at = coalesce(return_visit_configured_at, updated_at, created_at)
where return_visit_deadline_preset is not null
  and return_visit_configured_at is null;

update public.customer_follow_ups
set sales_contact_configured_at = coalesce(sales_contact_configured_at, updated_at, created_at)
where sales_contact_interval_days is not null
  and sales_contact_configured_at is null;

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_last_check_result_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_last_check_result_check
  check (
    last_check_result is null
    or last_check_result in ('未読無視', '既読無視', '返信あり', '仮来店', '来店予定')
  );

create table if not exists public.follow_up_activity_logs (
  id uuid primary key default gen_random_uuid(),
  follow_up_id uuid not null references public.customer_follow_ups(id) on delete cascade,
  cycle_id uuid not null,
  customer_id bigint not null references public.customers(id) on delete cascade,
  cast_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  check_result text,
  note text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_display_name text,
  actor_role text,
  event_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint follow_up_activity_logs_event_type_check
    check (event_type in ('started', 'ended', 'check')),
  constraint follow_up_activity_logs_check_result_check
    check (
      (event_type = 'check' and check_result is not null and check_result in ('未読無視', '既読無視', '返信あり', '仮来店', '来店予定'))
      or (event_type <> 'check' and check_result is null)
    ),
  constraint follow_up_activity_logs_note_length_check
    check (note is null or char_length(note) <= 1000)
);

alter table public.follow_up_activity_logs
  drop constraint if exists follow_up_activity_logs_check_result_check;
alter table public.follow_up_activity_logs
  add constraint follow_up_activity_logs_check_result_check
  check (
    (event_type = 'check' and check_result is not null and check_result in ('未読無視', '既読無視', '返信あり', '仮来店', '来店予定'))
    or (event_type <> 'check' and check_result is null)
  );

create index if not exists follow_up_activity_logs_follow_up_time_idx
  on public.follow_up_activity_logs(follow_up_id, event_at desc);

create index if not exists follow_up_activity_logs_customer_time_idx
  on public.follow_up_activity_logs(customer_id, event_at desc);

create index if not exists follow_up_activity_logs_cycle_idx
  on public.follow_up_activity_logs(cycle_id, event_at);

create unique index if not exists follow_up_activity_logs_cycle_boundary_uidx
  on public.follow_up_activity_logs(follow_up_id, cycle_id, event_type)
  where event_type in ('started', 'ended') and voided_at is null;

alter table public.follow_up_activity_logs enable row level security;

drop policy if exists "follow_up_activity_admin_all" on public.follow_up_activity_logs;
create policy "follow_up_activity_admin_all"
  on public.follow_up_activity_logs for all
  using (public.current_role() = 'admin')
  with check (public.current_role() = 'admin');

drop policy if exists "follow_up_activity_cast_read" on public.follow_up_activity_logs;
create policy "follow_up_activity_cast_read"
  on public.follow_up_activity_logs for select
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = follow_up_activity_logs.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

drop policy if exists "follow_up_activity_cast_insert" on public.follow_up_activity_logs;
create policy "follow_up_activity_cast_insert"
  on public.follow_up_activity_logs for insert
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and actor_user_id = auth.uid()
    and exists (
      select 1
      from public.customers c
      where c.id = follow_up_activity_logs.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

drop policy if exists "follow_up_activity_cast_update_own_check" on public.follow_up_activity_logs;
create policy "follow_up_activity_cast_update_own_check"
  on public.follow_up_activity_logs for update
  using (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and actor_user_id = auth.uid()
    and event_type = 'check'
    and exists (
      select 1
      from public.customers c
      where c.id = follow_up_activity_logs.customer_id
        and c.cast_name = public.current_cast_name()
    )
  )
  with check (
    public.current_role() = 'cast'
    and cast_id = auth.uid()
    and actor_user_id = auth.uid()
    and event_type = 'check'
    and exists (
      select 1
      from public.customers c
      where c.id = follow_up_activity_logs.customer_id
        and c.cast_name = public.current_cast_name()
    )
  );

revoke all on table public.follow_up_activity_logs from public, anon;
grant select, insert, update on table public.follow_up_activity_logs to authenticated;

-- 既存の追いかけ行にも、現在確認できる1期間分の開始・終了ログを補う。
insert into public.follow_up_activity_logs (
  follow_up_id,
  cycle_id,
  customer_id,
  cast_id,
  event_type,
  actor_user_id,
  event_at
)
select
  f.id,
  f.current_cycle_id,
  f.customer_id,
  f.cast_id,
  'started',
  f.activated_by,
  f.activated_at
from public.customer_follow_ups f
where not exists (
  select 1
  from public.follow_up_activity_logs l
  where l.follow_up_id = f.id
    and l.cycle_id = f.current_cycle_id
    and l.event_type = 'started'
);

insert into public.follow_up_activity_logs (
  follow_up_id,
  cycle_id,
  customer_id,
  cast_id,
  event_type,
  actor_user_id,
  event_at
)
select
  f.id,
  f.current_cycle_id,
  f.customer_id,
  f.cast_id,
  'ended',
  f.removed_by,
  f.removed_at
from public.customer_follow_ups f
where f.is_active = false
  and f.removed_at is not null
  and not exists (
    select 1
    from public.follow_up_activity_logs l
    where l.follow_up_id = f.id
      and l.cycle_id = f.current_cycle_id
      and l.event_type = 'ended'
  );

-- セッションのログインユーザーと追いかけ行から監査情報・スコープを強制設定する。
create or replace function public.prepare_follow_up_activity_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_row public.customer_follow_ups%rowtype;
  actor_row record;
begin
  select * into parent_row
  from public.customer_follow_ups
  where id = new.follow_up_id;

  if parent_row.id is null then
    raise exception '追いかけ項目が見つかりません';
  end if;

  new.customer_id := parent_row.customer_id;
  new.cast_id := parent_row.cast_id;
  if new.cycle_id is null then
    new.cycle_id := parent_row.current_cycle_id;
  end if;

  if auth.uid() is not null then
    new.actor_user_id := auth.uid();
    select
      coalesce(nullif(btrim(display_name), ''), nullif(btrim(cast_name), ''), '名前未設定') as actor_name,
      role as actor_role
    into actor_row
    from public.profiles
    where id = auth.uid();

    new.actor_display_name := actor_row.actor_name;
    new.actor_role := actor_row.actor_role;
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_follow_up_activity_log_trigger
  on public.follow_up_activity_logs;
create trigger prepare_follow_up_activity_log_trigger
  before insert on public.follow_up_activity_logs
  for each row execute function public.prepare_follow_up_activity_log();

-- 追いかけ開始・終了は親行の変更と同じトランザクションで必ず記録する。
create or replace function public.log_follow_up_cycle_boundary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.follow_up_activity_logs (
      follow_up_id, cycle_id, customer_id, cast_id,
      event_type, actor_user_id, event_at
    ) values (
      new.id, new.current_cycle_id, new.customer_id, new.cast_id,
      'started', new.activated_by, new.activated_at
    ) on conflict do nothing;
    return new;
  end if;

  if old.is_active is distinct from new.is_active then
    if new.is_active then
      insert into public.follow_up_activity_logs (
        follow_up_id, cycle_id, customer_id, cast_id,
        event_type, actor_user_id, event_at
      ) values (
        new.id, new.current_cycle_id, new.customer_id, new.cast_id,
        'started', new.activated_by, new.activated_at
      ) on conflict do nothing;
    else
      insert into public.follow_up_activity_logs (
        follow_up_id, cycle_id, customer_id, cast_id,
        event_type, actor_user_id, event_at
      ) values (
        new.id, new.current_cycle_id, new.customer_id, new.cast_id,
        'ended', new.removed_by, new.removed_at
      ) on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists log_follow_up_cycle_boundary_trigger
  on public.customer_follow_ups;
create trigger log_follow_up_cycle_boundary_trigger
  after insert or update of is_active on public.customer_follow_ups
  for each row execute function public.log_follow_up_cycle_boundary();

-- 担当者チェックの最新状態を親行へ同期する。取り消し時も直前の有効ログへ戻す。
create or replace function public.refresh_follow_up_check_summary(target_follow_up_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  latest_event_at timestamptz;
  latest_result text;
begin
  select event_at, check_result
  into latest_event_at, latest_result
  from public.follow_up_activity_logs
  where follow_up_id = target_follow_up_id
    and event_type = 'check'
    and voided_at is null
  order by event_at desc, created_at desc, id desc
  limit 1;

  update public.customer_follow_ups
  set
    last_checked_at = latest_event_at,
    last_check_result = latest_result
  where id = target_follow_up_id;
end;
$$;

create or replace function public.sync_follow_up_check_summary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.refresh_follow_up_check_summary(coalesce(new.follow_up_id, old.follow_up_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_follow_up_check_summary_trigger
  on public.follow_up_activity_logs;
create trigger sync_follow_up_check_summary_trigger
  after insert or update of voided_at on public.follow_up_activity_logs
  for each row
  when (new.event_type = 'check')
  execute function public.sync_follow_up_check_summary();

-- current cycle 内の実来店を再集計する。予定来店と未来日の誤登録は対象外。
create or replace function public.refresh_follow_up_repeat_for_customer(target_customer_id bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  follow_up_row record;
  latest_repeat timestamptz;
begin
  for follow_up_row in
    select f.id, f.activated_at
    from public.customer_follow_ups f
    join public.profiles p on p.id = f.cast_id
    join public.customers c on c.id = f.customer_id
    where f.customer_id = target_customer_id
      and f.is_active = true
      and p.cast_name is not null
      and c.cast_name = p.cast_name
  loop
    select max(
      (
        v.visit_date::text || ' ' ||
        coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
      )::timestamp at time zone 'Asia/Tokyo'
    )
    into latest_repeat
    from public.customer_visits v
    where v.customer_id = target_customer_id
      and v.is_planned is not true
      and (
        (
          v.visit_date::text || ' ' ||
          coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
        )::timestamp at time zone 'Asia/Tokyo'
      ) >= follow_up_row.activated_at
      and (
        (
          v.visit_date::text || ' ' ||
          coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59')
        )::timestamp at time zone 'Asia/Tokyo'
      ) <= now();

    update public.customer_follow_ups
    set last_repeated_at = latest_repeat
    where id = follow_up_row.id;
  end loop;
end;
$$;

create or replace function public.sync_follow_up_repeat_from_visit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_follow_up_repeat_for_customer(old.customer_id);
    return old;
  end if;

  perform public.refresh_follow_up_repeat_for_customer(new.customer_id);
  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    perform public.refresh_follow_up_repeat_for_customer(old.customer_id);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_follow_up_repeat_from_visit_trigger
  on public.customer_visits;
create trigger sync_follow_up_repeat_from_visit_trigger
  after insert or update of customer_id, visit_date, visit_time, is_planned or delete
  on public.customer_visits
  for each row execute function public.sync_follow_up_repeat_from_visit();

-- 適用時点の既存実来店も current cycle の範囲で反映する。
do $$
declare
  customer_row record;
begin
  for customer_row in
    select distinct customer_id
    from public.customer_follow_ups
    where is_active = true
  loop
    perform public.refresh_follow_up_repeat_for_customer(customer_row.customer_id);
  end loop;
end;
$$;

comment on table public.follow_up_activity_logs is
  '追いかけ期間ごとの開始・終了・担当者チェック監査ログ。来店はcustomer_visitsを参照して統合表示する。';
comment on column public.customer_follow_ups.current_cycle_id is
  '追いかけ再開ごとに更新する現在の追いかけ期間ID。';
comment on column public.customer_follow_ups.last_repeated_at is
  '現在の追いかけ期間開始後に登録された最新の実来店日時。';

revoke all on function public.prepare_follow_up_activity_log() from public, anon, authenticated;
revoke all on function public.log_follow_up_cycle_boundary() from public, anon, authenticated;
revoke all on function public.refresh_follow_up_check_summary(uuid) from public, anon, authenticated;
revoke all on function public.sync_follow_up_check_summary() from public, anon, authenticated;
revoke all on function public.refresh_follow_up_repeat_for_customer(bigint) from public, anon, authenticated;
revoke all on function public.sync_follow_up_repeat_from_visit() from public, anon, authenticated;
