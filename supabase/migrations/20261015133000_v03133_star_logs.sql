-- v0.3.133: ⭐️専用の期間・確認記録。廃止済みの追いかけ/通知とは接続しない。
begin;
lock table public.customers in share row exclusive mode;

create table if not exists public.customer_star_cycles (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customers(id) on delete cascade,
  started_on date,
  opened_at timestamptz not null default now(),
  ended_at timestamptz,
  last_checked_on date,
  last_status text check (last_status in ('未連絡','連絡済み','返信待ち','返信あり','来店予定')),
  restart_request_id uuid unique,
  opened_by uuid,
  check (ended_at is null or ended_at >= opened_at)
);
create unique index if not exists customer_star_cycles_open_uidx on public.customer_star_cycles(customer_id) where ended_at is null;
create index if not exists customer_star_cycles_customer_idx on public.customer_star_cycles(customer_id,opened_at desc,id);
create index if not exists customer_star_cycles_checked_idx on public.customer_star_cycles(last_checked_on,customer_id) where ended_at is null;
create index if not exists customer_star_cycles_ended_idx on public.customer_star_cycles(ended_at desc,id) where ended_at is not null;
create table if not exists public.customer_star_logs (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.customer_star_cycles(id) on delete cascade,
  kind text not null check (kind in ('started','ended','check','start_date')),
  event_on date not null,
  started_on date,
  status text,
  note text check (char_length(note) <= 2000),
  actor_id uuid,
  actor_name text,
  recorded_at timestamptz not null default now(),
  request_id uuid unique,
  request_payload jsonb,
  check ((kind = 'check' and status in ('未連絡','連絡済み','返信待ち','返信あり','来店予定') and status is not null) or (kind <> 'check' and status is null))
);
create index if not exists customer_star_logs_cycle_idx on public.customer_star_logs(cycle_id,event_on desc,recorded_at desc,id);

-- APIと同じ有効アカウント/顧客権限。担当移動後は現在の担当範囲で判定する。
create or replace function public.star_log_access(p_customer_id bigint,p_write boolean default false)
returns boolean language sql volatile security definer set search_path = public,pg_temp as $$
  select exists (
    select 1 from public.profiles p join public.customers c on c.id=p_customer_id
    where p.id=auth.uid() and p.is_active and (
      (p.role='cast' and nullif(p.cast_name,'') is not null and c.cast_name=p.cast_name)
      or (p.role='admin' and (p.is_owner or exists (
        select 1 from public.staff_permissions sp where sp.staff_id=p.id and sp.enabled and
        sp.permission = any(case when p_write then array['顧客.編集','顧客.担当'] else array['顧客.閲覧','顧客.編集','顧客.全店分析','顧客.担当'] end)
      )))
    )
  )
$$;
alter table public.customer_star_cycles enable row level security;
alter table public.customer_star_logs enable row level security;
drop policy if exists star_cycles_read on public.customer_star_cycles;
create policy star_cycles_read on public.customer_star_cycles for select to authenticated using (public.star_log_access(customer_id));
drop policy if exists star_logs_read on public.customer_star_logs;
create policy star_logs_read on public.customer_star_logs for select to authenticated using (
  exists (select 1 from public.customer_star_cycles cy where cy.id=cycle_id and public.star_log_access(cy.customer_id))
);
revoke all on public.customer_star_cycles,public.customer_star_logs from public,anon,authenticated;
grant select on public.customer_star_cycles,public.customer_star_logs to authenticated;
grant all on public.customer_star_cycles,public.customer_star_logs to service_role;
revoke all on function public.star_log_access(bigint,boolean) from public,anon;
grant execute on function public.star_log_access(bigint,boolean) to authenticated,service_role;

-- 既存⭐️の開始日は不明。移行日時や旧追いかけ開始日で捏造しない。
insert into public.customer_star_cycles(customer_id,started_on)
select c.id,null from public.customers c where c.is_starred and not exists (
  select 1 from public.customer_star_cycles cy where cy.customer_id=c.id and cy.ended_at is null
);

create or replace function public.capture_customer_star_cycle()
returns trigger language plpgsql security definer set search_path = public,pg_temp as $$
declare cy public.customer_star_cycles; actor text;
begin
  if tg_op='UPDATE' and new.is_starred is not distinct from old.is_starred then return new; end if;
  select coalesce(display_name,cast_name,'記録者') into actor from public.profiles where id=auth.uid();
  if new.is_starred then
    insert into public.customer_star_cycles(customer_id,started_on,opened_by)
    values(new.id,(now() at time zone 'Asia/Tokyo')::date,auth.uid()) returning * into cy;
    insert into public.customer_star_logs(cycle_id,kind,event_on,started_on,actor_id,actor_name)
    values(cy.id,'started',cy.started_on,cy.started_on,auth.uid(),coalesce(actor,'システム'));
  elsif tg_op='UPDATE' and old.is_starred then
    update public.customer_star_cycles set ended_at=now() where customer_id=new.id and ended_at is null returning * into cy;
    if cy.id is not null then
      insert into public.customer_star_logs(cycle_id,kind,event_on,actor_id,actor_name)
      values(cy.id,'ended',(now() at time zone 'Asia/Tokyo')::date,auth.uid(),coalesce(actor,'システム'));
    end if;
  end if;
  return new;
end $$;
revoke all on function public.capture_customer_star_cycle() from public,anon,authenticated;
drop trigger if exists capture_customer_star_cycle on public.customers;
create trigger capture_customer_star_cycle after insert or update of is_starred on public.customers
for each row execute function public.capture_customer_star_cycle();

-- 同じ顧客の⭐️変更と記録は顧客行ロックで直列化。終了した期間へは追記しない。
create or replace function public.record_customer_star_log(
  p_customer_id bigint,p_cycle_id uuid,p_started_on date,p_expected_started_on date,
  p_checked_on date,p_status text,p_note text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare cy public.customer_star_cycles; old_log public.customer_star_logs; payload jsonb; actor text; starred boolean; latest public.customer_star_logs;
begin
  if not public.star_log_access(p_customer_id,true) then raise exception '対象を編集できません' using errcode='42501'; end if;
  select is_starred into starred from public.customers where id=p_customer_id for update;
  if not public.star_log_access(p_customer_id,true) then raise exception '担当が変更されています' using errcode='42501'; end if;
  select * into cy from public.customer_star_cycles where id=p_cycle_id and customer_id=p_customer_id for update;
  if cy.id is null then raise exception '対象の記録がありません' using errcode='P0002'; end if;
  payload=jsonb_build_object('cycle',p_cycle_id,'start',p_started_on,'expected',p_expected_started_on,'day',p_checked_on,'status',p_status,'note',p_note);
  select * into old_log from public.customer_star_logs where request_id=p_request_id;
  if old_log.id is not null then
    if old_log.actor_id=auth.uid() and old_log.request_payload=payload then return jsonb_build_object('ok',true,'replayed',true); end if;
    raise exception '同じ記録IDで異なる内容は保存できません' using errcode='40001';
  end if;
  if cy.ended_at is not null or starred is not true then raise exception '⭐️が解除されています。開き直してください' using errcode='40001'; end if;
  if p_request_id is null or p_checked_on is null or p_checked_on>(now() at time zone 'Asia/Tokyo')::date or p_status is null
    or p_status not in ('未連絡','連絡済み','返信待ち','返信あり','来店予定') or p_note is null or char_length(p_note)>2000
    or p_started_on>p_checked_on then raise exception '日付・状況・メモを確認してください' using errcode='22023'; end if;
  if cy.started_on is distinct from p_expected_started_on then raise exception '開始日が変更されています。開き直してください' using errcode='40001'; end if;
  if p_started_on is distinct from cy.started_on then
    if p_started_on is null and cy.started_on is not null then raise exception '設定した開始日は空に戻せません' using errcode='22023'; end if;
    if exists(select 1 from public.customer_star_logs where cycle_id=cy.id and kind='check' and event_on<p_started_on) then
      raise exception '開始日は最初の確認日以前にしてください' using errcode='22023';
    end if;
    update public.customer_star_cycles set started_on=p_started_on where id=cy.id;
    select coalesce(display_name,cast_name,'記録者') into actor from public.profiles where id=auth.uid();
    insert into public.customer_star_logs(cycle_id,kind,event_on,started_on,actor_id,actor_name)
    values(cy.id,'start_date',(now() at time zone 'Asia/Tokyo')::date,p_started_on,auth.uid(),actor);
  end if;
  select coalesce(display_name,cast_name,'記録者') into actor from public.profiles where id=auth.uid();
  insert into public.customer_star_logs(cycle_id,kind,event_on,status,note,actor_id,actor_name,request_id,request_payload)
  values(cy.id,'check',p_checked_on,p_status,nullif(btrim(p_note),''),auth.uid(),actor,p_request_id,payload);
  select * into latest from public.customer_star_logs where cycle_id=cy.id and kind='check' order by event_on desc,recorded_at desc,id desc limit 1;
  update public.customer_star_cycles set last_checked_on=latest.event_on,last_status=latest.status where id=cy.id;
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.restart_customer_star(p_customer_id bigint,p_cycle_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare cy public.customer_star_cycles; previous public.customer_star_cycles; starred boolean;
begin
  if not public.star_log_access(p_customer_id,true) then raise exception '対象を編集できません' using errcode='42501'; end if;
  select is_starred into starred from public.customers where id=p_customer_id for update;
  if not public.star_log_access(p_customer_id,true) then raise exception '担当が変更されています' using errcode='42501'; end if;
  select * into cy from public.customer_star_cycles where restart_request_id=p_request_id;
  if cy.id is not null then
    if cy.customer_id=p_customer_id and cy.opened_by=auth.uid() then return jsonb_build_object('ok',true,'replayed',true); end if;
    raise exception '記録IDが競合しています' using errcode='40001';
  end if;
  select * into previous from public.customer_star_cycles where customer_id=p_customer_id order by opened_at desc,id desc limit 1;
  if p_request_id is null or previous.id is distinct from p_cycle_id or previous.ended_at is null or starred then
    raise exception '⭐️の状態が変更されています。開き直してください' using errcode='40001';
  end if;
  update public.customers set is_starred=true where id=p_customer_id;
  update public.customer_star_cycles set restart_request_id=p_request_id where customer_id=p_customer_id and ended_at is null returning * into cy;
  return jsonb_build_object('ok',true,'cycle_id',cy.id);
end $$;
revoke all on function public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid),public.restart_customer_star(bigint,uuid,uuid) from public,anon;
grant execute on function public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid),public.restart_customer_star(bigint,uuid,uuid) to authenticated;
commit;
