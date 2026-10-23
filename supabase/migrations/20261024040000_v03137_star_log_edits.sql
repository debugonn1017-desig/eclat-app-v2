-- v0.3.137: 共有確認者・確認ログの編集/削除/復元。顧客の星/ランク/連絡日は変更しない。
begin;
alter table public.customer_star_cycles add column if not exists last_checked_by text;
alter table public.customer_star_logs add column if not exists revision integer not null default 0 check (revision >= 0);
alter table public.customer_star_logs add column if not exists edited_at timestamptz;
alter table public.customer_star_logs add column if not exists edited_by_name text;
alter table public.customer_star_logs add column if not exists deleted_at timestamptz;
alter table public.customer_star_logs add column if not exists deleted_by_name text;

-- 変更前の本文はサービス専用監査へ残す。通常の閲覧/編集ユーザーに監査表を公開しない。
create table if not exists public.customer_star_log_changes (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.customer_star_logs(id) on delete cascade,
  action text not null check (action in ('edit','delete','restore')),
  before_snapshot jsonb not null,
  actor_id uuid not null,
  actor_name text,
  changed_at timestamptz not null default now(),
  request_id uuid not null unique,
  request_payload jsonb not null
);
alter table public.customer_star_log_changes enable row level security;
revoke all on public.customer_star_log_changes from public,anon,authenticated;
grant all on public.customer_star_log_changes to service_role;
create index if not exists customer_star_log_changes_log_idx on public.customer_star_log_changes(log_id,changed_at desc);

-- 既存の最終確認日/状況は変えず、その記録の実際の記録者だけ補う。
with latest as (
  select distinct on (cycle_id) cycle_id,event_on,status,actor_name
  from public.customer_star_logs where kind='check' and deleted_at is null
  order by cycle_id,event_on desc,recorded_at desc,id desc
)
update public.customer_star_cycles cy set last_checked_by=latest.actor_name
from latest where cy.id=latest.cycle_id and cy.last_checked_on=latest.event_on and cy.last_status=latest.status;

create or replace function public.refresh_star_cycle_check(p_cycle_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare latest public.customer_star_logs;
begin
  select * into latest from public.customer_star_logs where cycle_id=p_cycle_id and kind='check' and deleted_at is null
    order by event_on desc,recorded_at desc,id desc limit 1;
  update public.customer_star_cycles set last_checked_on=latest.event_on,last_status=latest.status,last_checked_by=latest.actor_name where id=p_cycle_id;
end $$;
revoke all on function public.refresh_star_cycle_check(uuid) from public,anon,authenticated;
create or replace function public.capture_star_log_check_summary()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then
    if old.kind='check' then perform public.refresh_star_cycle_check(old.cycle_id); end if;
    return old;
  end if;
  if new.kind='check' then perform public.refresh_star_cycle_check(new.cycle_id); end if;
  return new;
end $$;
revoke all on function public.capture_star_log_check_summary() from public,anon,authenticated;
drop trigger if exists capture_star_log_check_summary on public.customer_star_logs;
create trigger capture_star_log_check_summary after insert or update or delete on public.customer_star_logs
  for each row execute function public.capture_star_log_check_summary();

-- 削除済みの本文は編集権限のある人だけが復元用に閲覧できる。
drop policy if exists star_logs_read on public.customer_star_logs;
create policy star_logs_read on public.customer_star_logs for select to authenticated using (
  exists (select 1 from public.customer_star_cycles cy where cy.id=cycle_id and public.star_log_access(cy.customer_id)
    and (deleted_at is null or public.star_log_access(cy.customer_id,true)))
);

-- 新規確認は既存の原子的処理を維持。削除済みログを開始日・最終確認の計算に使わない。
create or replace function public.record_customer_star_log(
  p_customer_id bigint,p_cycle_id uuid,p_started_on date,p_expected_started_on date,
  p_checked_on date,p_status text,p_note text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare cy public.customer_star_cycles; old_log public.customer_star_logs; payload jsonb; actor text; starred boolean;
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
    if exists(select 1 from public.customer_star_logs where cycle_id=cy.id and kind='check' and deleted_at is null and event_on<p_started_on) then
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
  return jsonb_build_object('ok',true);
end $$;

-- 本文の書換えも顧客→期間→ログの順にロックし、担当移動・同時更新・再送を検出する。
create or replace function public.modify_customer_star_log(
  p_customer_id bigint,p_log_id uuid,p_expected_revision integer,p_action text,
  p_checked_on date,p_status text,p_note text,p_request_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entry public.customer_star_logs; cy public.customer_star_cycles; previous public.customer_star_log_changes; payload jsonb; actor text;
begin
  if not public.star_log_access(p_customer_id,true) then raise exception '対象を編集できません' using errcode='42501'; end if;
  perform 1 from public.customers where id=p_customer_id for update;
  if not public.star_log_access(p_customer_id,true) then raise exception '担当が変更されています' using errcode='42501'; end if;
  select cy0.* into cy from public.customer_star_cycles cy0 join public.customer_star_logs l on l.cycle_id=cy0.id
    where l.id=p_log_id and cy0.customer_id=p_customer_id for update of cy0;
  if cy.id is null then raise exception '対象の記録がありません' using errcode='P0002'; end if;
  select * into entry from public.customer_star_logs where id=p_log_id for update;
  payload=jsonb_build_object('customer',p_customer_id,'log',p_log_id,'revision',p_expected_revision,'action',p_action,'day',p_checked_on,'status',p_status,'note',p_note);
  select * into previous from public.customer_star_log_changes where request_id=p_request_id;
  if previous.id is not null then
    if previous.actor_id=auth.uid() and previous.request_payload=payload then return jsonb_build_object('ok',true,'replayed',true); end if;
    raise exception '同じ記録IDで異なる内容は保存できません' using errcode='40001';
  end if;
  if p_request_id is null or p_expected_revision is null or p_expected_revision<0 or p_action is null or p_action not in ('edit','delete','restore') or entry.kind<>'check' then
    raise exception '確認ログだけを編集・削除・復元できます' using errcode='22023';
  end if;
  if entry.revision<>p_expected_revision then raise exception '別の人が記録を変更しました。読み直してください' using errcode='40001'; end if;
  if (p_action in ('edit','delete') and entry.deleted_at is not null) or (p_action='restore' and entry.deleted_at is null) then
    raise exception '削除の状態が変更されています。読み直してください' using errcode='40001';
  end if;
  if p_action='edit' then
    if p_checked_on is null or p_checked_on>(now() at time zone 'Asia/Tokyo')::date or p_checked_on<cy.started_on
      or p_status is null or p_status not in ('未連絡','連絡済み','返信待ち','返信あり','来店予定') or p_note is null or char_length(p_note)>2000 then
      raise exception '確認日は開始日以降・今日以前、メモは2000文字以内にしてください' using errcode='22023';
    end if;
  elsif p_checked_on is not null or p_status is not null or p_note is not null then
    raise exception '削除・復元では本文を変更できません' using errcode='22023';
  end if;
  if p_action='restore' and entry.event_on<cy.started_on then
    raise exception '開始日より前の確認記録です。開始日を確認してください' using errcode='22023';
  end if;
  select coalesce(display_name,cast_name,'記録者') into actor from public.profiles where id=auth.uid();
  insert into public.customer_star_log_changes(log_id,action,before_snapshot,actor_id,actor_name,request_id,request_payload)
  values(entry.id,p_action,to_jsonb(entry),auth.uid(),actor,p_request_id,payload);
  if p_action='edit' then
    update public.customer_star_logs set event_on=p_checked_on,status=p_status,note=nullif(btrim(p_note),''),revision=revision+1,edited_at=now(),edited_by_name=actor where id=entry.id;
  elsif p_action='delete' then
    update public.customer_star_logs set deleted_at=now(),deleted_by_name=actor,revision=revision+1 where id=entry.id;
  else
    update public.customer_star_logs set deleted_at=null,deleted_by_name=null,revision=revision+1 where id=entry.id;
  end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.modify_customer_star_log(bigint,uuid,integer,text,date,text,text,uuid) from public,anon;
grant execute on function public.modify_customer_star_log(bigint,uuid,integer,text,date,text,text,uuid) to authenticated;
-- 元の記録用RPCの公開範囲も維持。
revoke all on function public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid) from public,anon;
grant execute on function public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid) to authenticated;
commit;
