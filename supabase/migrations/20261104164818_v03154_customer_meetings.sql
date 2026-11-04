-- 会議専用の追記ログ。既存の顧客・来店・売上・メモへ書き込まない。
begin;
create function public.customer_meeting_values_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text; lim integer;
begin
  if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>40000 then return false; end if;
  if (select count(*) from jsonb_object_keys(v))<>17 or v - array['priority','in_time','out_time','table_number','party_size','honshimei','nomination_route','after_place','after_casts','next_info','contact_content','follow_period','thank_you','rally','action','meeting_amount','meeting_unit_price'] <> '{}'::jsonb then return false; end if;
  if coalesce(v->>'priority','') not in ('高','中','低') or coalesce(v->>'follow_period','') not in ('1週間','2週間','1ヶ月','2ヶ月','未設定') then return false; end if;
  foreach k in array array['in_time','out_time'] loop
    if v->k<>'null'::jsonb and (jsonb_typeof(v->k)<>'string' or v->>k !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then return false; end if;
  end loop;
  for k,lim in select * from (values ('table_number',20),('honshimei',100),('nomination_route',500),('after_place',200),('after_casts',200),('next_info',4000),('contact_content',4000)) as limits(k,lim) loop
    if jsonb_typeof(v->k)<>'string' or char_length(v->>k)>lim then return false; end if;
  end loop;
  foreach k in array array['party_size','meeting_amount','meeting_unit_price'] loop
    if v->k<>'null'::jsonb then
      if jsonb_typeof(v->k)<>'number' or v->>k !~ '^[0-9]+$' then return false; end if;
      if k='party_size' and (v->>k)::numeric not between 1 and 99 then return false; end if;
      if k<>'party_size' and (v->>k)::numeric not between 0 and 999999999 then return false; end if;
    end if;
  end loop;
  foreach k in array array['thank_you','rally','action'] loop
    if jsonb_typeof(v->k)<>'boolean' then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.customer_meeting_values_valid(jsonb) from public,anon;
grant execute on function public.customer_meeting_values_valid(jsonb) to authenticated,service_role;

create table public.customer_meeting_records (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null references public.customers(id) on delete cascade,
  -- 元visitの削除を妨げず、削除後も会議履歴を保持するため、IDはsnapshotとして保持する。
  visit_id bigint not null check(visit_id>0),
  expected_visit_date date not null,
  base_revision integer not null check(base_revision>=0 and base_revision<2147483647),
  revision integer not null check(revision>0),
  visit_date date not null check(visit_date >= date '2000-01-01' and visit_date < date '2200-01-01'),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  customer_snapshot jsonb not null check(jsonb_typeof(customer_snapshot)='object'),
  has_after boolean not null,
  "values" jsonb not null check(public.customer_meeting_values_valid("values")),
  request_id uuid not null unique,
  unique(visit_id,revision),
  check(expected_visit_date=visit_date and revision=base_revision+1)
);
create index customer_meeting_records_customer_history_idx on public.customer_meeting_records(customer_id,created_at desc,id);
alter table public.customer_meeting_records enable row level security;
create policy customer_meetings_read on public.customer_meeting_records for select to authenticated
using (public.star_log_access(customer_id,false));
create policy customer_meetings_insert on public.customer_meeting_records for insert to authenticated
with check (actor_id=(select auth.uid()) and public.star_log_access(customer_id,true));

create function public.stamp_customer_meeting_record() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c record; v record; p record; previous public.customer_meeting_records%rowtype;
begin
  if auth.uid() is null or not public.star_log_access(new.customer_id,true) then raise exception 'このお客様の会議記録を編集できません' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_meeting:'||new.visit_id::text,0));
  select id,customer_name,nickname,region,age_group,occupation,cast_name,nomination_status,is_starred,nomination_route into c from public.customers where id=new.customer_id for share;
  select id,customer_id,visit_date,is_planned,has_after into v from public.customer_visits where id=new.visit_id and customer_id=new.customer_id for share;
  if c.id is null or v.id is null or v.is_planned is true or v.visit_date>timezone('Asia/Tokyo',now())::date or v.visit_date is distinct from new.expected_visit_date then raise exception '元の来店情報が変更されています。入力を残して再取得してください' using errcode='40001'; end if;
  select * into previous from public.customer_meeting_records where visit_id=new.visit_id order by revision desc limit 1;
  if coalesce(previous.revision,0)<>new.base_revision or (previous.id is not null and (previous.customer_id<>new.customer_id or previous.visit_date<>v.visit_date)) then raise exception '会議記録が変更されています。入力を残して履歴を再取得してください' using errcode='40001'; end if;
  if previous.id is null and (c.is_starred is not true or c.nomination_status is distinct from '場内') then raise exception '初回記録は現在の⭐️場内のお客様の実来店のみ作成できます' using errcode='42501'; end if;
  select id,display_name,cast_name into p from public.profiles where id=auth.uid() and is_active;
  if p.id is null or not public.star_log_access(new.customer_id,true) then raise exception '担当または権限が変わっています' using errcode='42501'; end if;
  new.id:=gen_random_uuid(); new.revision:=new.base_revision+1; new.visit_date:=v.visit_date;
  new.actor_id:=p.id; new.actor_name:=coalesce(nullif(p.display_name,''),nullif(p.cast_name,''),'スタッフ'); new.created_at:=clock_timestamp();
  new.customer_snapshot:=jsonb_build_object('id',c.id::text,'customer_name',c.customer_name,'nickname',c.nickname,'region',c.region,'age_group',c.age_group,'occupation',c.occupation,'cast_name',c.cast_name,'nomination_status',c.nomination_status,'is_starred',c.is_starred,'nomination_route',c.nomination_route);
  new.has_after:=coalesce(v.has_after,false);
  return new;
end $$;
revoke all on function public.stamp_customer_meeting_record() from public,anon,authenticated;
create trigger stamp_customer_meeting_record before insert on public.customer_meeting_records for each row execute function public.stamp_customer_meeting_record();

create function public.save_customer_meeting(p_customer_id bigint,p_visit_id bigint,p_expected_visit_date date,p_expected_revision integer,p_request_id uuid,p_values jsonb)
returns public.customer_meeting_records language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing public.customer_meeting_records%rowtype; previous public.customer_meeting_records%rowtype; saved public.customer_meeting_records%rowtype; v record;
begin
  if auth.uid() is null or not public.star_log_access(p_customer_id,true) then raise exception 'このお客様の会議記録を編集できません' using errcode='42501'; end if;
  if not public.customer_meeting_values_valid(p_values) or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or p_request_id is null or p_expected_visit_date is null then raise exception '会議入力の形式が不正です' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_meeting:'||p_visit_id::text,0));
  perform 1 from public.customers where id=p_customer_id for share;
  if not found or not public.star_log_access(p_customer_id,true) then raise exception '担当または権限が変わっています' using errcode='42501'; end if;
  select * into existing from public.customer_meeting_records where request_id=p_request_id;
  if existing.id is not null then
    if existing.actor_id<>auth.uid() or existing.customer_id<>p_customer_id or existing.visit_id<>p_visit_id or existing.base_revision<>p_expected_revision or existing.visit_date<>p_expected_visit_date or existing."values"<>p_values then raise exception '保存リクエストが別の入力に使用されています' using errcode='22023'; end if;
    return existing;
  end if;
  select id,customer_id,visit_date,is_planned into v from public.customer_visits where id=p_visit_id and customer_id=p_customer_id for share;
  if v.id is null or v.is_planned is true or v.visit_date is distinct from p_expected_visit_date or v.visit_date>timezone('Asia/Tokyo',now())::date then raise exception '元の来店情報が変更されています。入力を残して再取得してください' using errcode='40001'; end if;
  select * into previous from public.customer_meeting_records where visit_id=p_visit_id order by revision desc limit 1;
  if coalesce(previous.revision,0)<>p_expected_revision or (previous.id is not null and (previous.customer_id<>p_customer_id or previous.visit_date<>p_expected_visit_date)) then raise exception '会議記録が変更されています。入力を残して履歴を再取得してください' using errcode='40001'; end if;
  if previous.id is not null and previous."values"=p_values then return previous; end if;
  insert into public.customer_meeting_records(customer_id,visit_id,expected_visit_date,base_revision,request_id,"values") values(p_customer_id,p_visit_id,p_expected_visit_date,p_expected_revision,p_request_id,p_values) returning * into saved;
  return saved;
end $$;
revoke all on function public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb) to authenticated,service_role;
revoke all on public.customer_meeting_records from public,anon,authenticated;
grant select on public.customer_meeting_records to authenticated;
grant insert(customer_id,visit_id,expected_visit_date,base_revision,request_id,"values") on public.customer_meeting_records to authenticated;
grant all on public.customer_meeting_records to service_role;
comment on table public.customer_meeting_records is '会議専用の顧客・実来店別改訂ログ。金額/単価は独立入力で売上集計と無関係。来店削除・星解除後も保持し、お客様のメモ履歴と共通表示。';
commit;
