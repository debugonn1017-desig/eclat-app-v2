-- 明示的な来店時指名区分の訂正。過去データは書き換えない。
-- 10分以内という時刻依存の補正だけを廃止し、既存snapshot保存triggerは維持する。
-- RPCは認証済みAPIからservice_roleだけが呼ぶ。DBでも実ユーザーの現在権限を確認する。
begin;

drop trigger if exists nomination_history_sync_recent_visit_nomination on public.nomination_history;

create table public.customer_visit_nomination_corrections (
  id uuid primary key default gen_random_uuid(),
  customer_id bigint not null,
  visit_id bigint not null,
  visit_date date not null,
  old_status text check(old_status is null or old_status in ('フリー','場内','本指名')),
  new_status text not null check(new_status in ('フリー','場内','本指名')),
  revision integer not null check(revision>0),
  actor_id uuid not null,
  actor_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  request_id uuid not null unique,
  request_fingerprint jsonb not null,
  unique(visit_id,revision)
);
create index customer_visit_nomination_corrections_customer_idx
  on public.customer_visit_nomination_corrections(customer_id,created_at desc,id);
alter table public.customer_visit_nomination_corrections enable row level security;
create policy customer_visit_nomination_corrections_read on public.customer_visit_nomination_corrections
  for select to authenticated using(public.star_log_access(customer_id,false));
revoke all on public.customer_visit_nomination_corrections from public,anon,authenticated,service_role;
grant select(id,customer_id,visit_id,visit_date,old_status,new_status,revision,actor_id,actor_name,created_at)
  on public.customer_visit_nomination_corrections to authenticated;
grant select,insert on public.customer_visit_nomination_corrections to service_role;

create function public.correct_customer_visit_nomination(
  p_actor_id uuid,p_customer_id bigint,p_customer_patch jsonb,
  p_expected_customer_status text,p_visit_id bigint,p_expected_visit_date date,
  p_expected_visit_status text,p_new_visit_status text,p_expected_revision integer,
  p_request_id uuid,p_require_latest boolean
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  c public.customers%rowtype;
  v public.customer_visits%rowtype;
  actor public.profiles%rowtype;
  prior public.customer_visit_nomination_corrections%rowtype;
  saved public.customer_visit_nomination_corrections%rowtype;
  fingerprint jsonb;
  effective_patch jsonb;
  old_customer_status text;
  latest_visit_id bigint;
  assigned_cast_id uuid;
  current_revision integer;
  set_columns text;
  k text;
  old_claims text:=current_setting('request.jwt.claims',true);
  old_sub text:=current_setting('request.jwt.claim.sub',true);
  old_rank_operation text:=current_setting('app.rank_operation',true);
begin
  -- ACLが主防御。明示role検証で、誤ったGRANT追加にも閉じる。
  if current_user<>'service_role' then
    raise exception 'この訂正は認証済みのアプリから実行してください' using errcode='42501';
  end if;
  if p_actor_id is null or p_customer_id is null or p_customer_id<=0 or p_visit_id is null or p_visit_id<=0
    or p_expected_visit_date is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647
    or p_request_id is null or p_require_latest is null
    or p_customer_patch is null or jsonb_typeof(p_customer_patch)<>'object' or octet_length(p_customer_patch::text)>100000
    or p_new_visit_status is null or p_new_visit_status not in ('フリー','場内','本指名')
    or (p_expected_visit_status is not null and p_expected_visit_status not in ('フリー','場内','本指名'))
    or (p_expected_customer_status is not null and p_expected_customer_status not in ('フリー','場内','本指名')) then
    raise exception '訂正する来店と指名区分を確認してください' using errcode='22023';
  end if;
  for k in select jsonb_object_keys(p_customer_patch) loop
    if k<>all(array[
      'is_starred','no_reply','customer_name','nickname','cast_name','cast_type','has_customer_staff','nomination_status',
      'age_group','occupation','region','spouse_status','birthday','blood_type','hobby','nomination_route','relationship_type',
      'phase','customer_rank','sales_expectation','trend','favorite_type','ng_items','score','memo','last_contact_date',
      'next_contact_date','first_visit_date','monthly_target_visits','monthly_target_sales','actual_visit_frequency',
      'recommended_contact_frequency','sales_priority','sales_objective','recommended_tone','recommended_distance',
      'recommended_direction','best_time_to_contact','ng_contact_time','ng_contact_day','warning_points','important_points',
      'recommended_line_thanks','recommended_line_sales','recommended_line_visit','final_recommended_note','phase_shoshimei_at'
    ]) then raise exception '訂正時の顧客入力が不正です' using errcode='22023'; end if;
  end loop;
  if p_customer_patch<>'{}'::jsonb and (
    p_customer_patch->>'nomination_status' is distinct from '本指名'
    or p_new_visit_status<>'本指名' or not p_require_latest
  ) then raise exception '顧客の本指名変更と直近来店の訂正を確認してください' using errcode='22023'; end if;
  if p_customer_patch ? 'customer_name' and
    (jsonb_typeof(p_customer_patch->'customer_name')<>'string' or btrim(p_customer_patch->>'customer_name')='') then
    raise exception 'お客様名を入力してください' using errcode='22023';
  end if;
  foreach k in array array['is_starred','no_reply','has_customer_staff'] loop
    if p_customer_patch ? k and jsonb_typeof(p_customer_patch->k)<>'boolean' then
      raise exception '顧客のマークの値が不正です' using errcode='22023';
    end if;
  end loop;
  if p_customer_patch ? 'customer_rank' and p_customer_patch->'customer_rank'<>'null'::jsonb
    and p_customer_patch->>'customer_rank' not in ('S','A','B','C','切れた') then
    raise exception 'ランクが不正です' using errcode='22023';
  end if;

  -- 同じcustomer/visitの同時訂正とrequestIdの競合を直列化。順序はcustomer→visit。
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('visit_nomination_request:'||p_request_id::text,0));
  select * into c from public.customers where id=p_customer_id for update;
  select * into actor from public.profiles where id=p_actor_id and is_active for share;
  if c.id is null or actor.id is null or not coalesce((
    (actor.role='cast' and nullif(actor.cast_name,'') is not null and c.cast_name=actor.cast_name)
    or (actor.role='admin' and (actor.is_owner or exists(
      select 1 from public.staff_permissions sp where sp.staff_id=actor.id and sp.enabled and sp.permission in ('顧客.編集','顧客.担当')
    )))
  ),false) then raise exception 'このお客様の来店区分を訂正できません' using errcode='42501'; end if;
  if actor.role='cast' and p_customer_patch ? 'cast_name'
    and p_customer_patch->>'cast_name' is distinct from c.cast_name then
    raise exception '担当キャストは変更できません' using errcode='42501';
  end if;

  fingerprint:=jsonb_build_object(
    'customer_id',p_customer_id,'customer_patch',p_customer_patch,'expected_customer_status',p_expected_customer_status,
    'visit_id',p_visit_id,'expected_visit_date',p_expected_visit_date,'expected_visit_status',p_expected_visit_status,
    'new_visit_status',p_new_visit_status,'expected_revision',p_expected_revision,'require_latest',p_require_latest
  );
  select * into prior from public.customer_visit_nomination_corrections where request_id=p_request_id;
  if prior.id is not null then
    if prior.actor_id<>p_actor_id or prior.request_fingerprint<>fingerprint then
      raise exception 'この保存リクエストは別の訂正に使われています' using errcode='22023';
    end if;
    select * into v from public.customer_visits where id=p_visit_id and customer_id=p_customer_id;
    select coalesce(max(revision),0) into current_revision from public.customer_visit_nomination_corrections where visit_id=p_visit_id;
    if v.id is null or v.visit_date is distinct from prior.visit_date or v.is_planned is true
      or v.nomination_status_at_visit is distinct from prior.new_status or current_revision<>prior.revision
      or (p_customer_patch<>'{}'::jsonb and c.nomination_status is distinct from (p_customer_patch->>'nomination_status')) then
      raise exception '訂正済みの来店が変更されています。入力を残して再取得してください' using errcode='40001';
    end if;
    return jsonb_build_object('customer',to_jsonb(c),'visit',to_jsonb(v),
      'correction',to_jsonb(prior)-'request_fingerprint'-'request_id');
  end if;

  select * into v from public.customer_visits where id=p_visit_id and customer_id=p_customer_id for update;
  if (p_customer_patch<>'{}'::jsonb and c.nomination_status is distinct from p_expected_customer_status)
    or v.id is null or v.visit_date is distinct from p_expected_visit_date or v.is_planned is true
    or v.visit_date>timezone('Asia/Tokyo',now())::date
    or v.nomination_status_at_visit is distinct from p_expected_visit_status then
    raise exception '顧客または来店の情報が変更されています。入力を残して再取得してください' using errcode='40001';
  end if;
  select coalesce(max(revision),0) into current_revision from public.customer_visit_nomination_corrections where visit_id=p_visit_id;
  if current_revision<>p_expected_revision then
    raise exception 'この来店区分は訂正されています。入力を残して再取得してください' using errcode='40001';
  end if;
  if p_require_latest then
    select id into latest_visit_id from public.customer_visits
      where customer_id=p_customer_id and is_planned is not true and visit_date<=timezone('Asia/Tokyo',now())::date
      order by visit_date desc,created_at desc,id desc limit 1;
    if latest_visit_id is distinct from p_visit_id then
      raise exception '直近の来店が変更されています。対象日を確認して選び直してください' using errcode='40001';
    end if;
  end if;
  if v.nomination_status_at_visit is not distinct from p_new_visit_status then
    raise exception '来店の指名区分は変更されていません' using errcode='22023';
  end if;

  -- 既存ランク監査がauth.uid()を読むため、認可済みの実ユーザーだけをtransaction内に設定。
  -- SQL roleはservice_roleのまま。ユーザーが渡すclaims/metadataを受理しない。
  perform pg_catalog.set_config('request.jwt.claims',
    (coalesce(nullif(old_claims,''),'{}')::jsonb || jsonb_build_object('sub',p_actor_id::text,'role','service_role'))::text,true);
  perform pg_catalog.set_config('request.jwt.claim.sub',p_actor_id::text,true);
  perform pg_catalog.set_config('app.rank_operation','',true);
  old_customer_status:=c.nomination_status;
  if p_customer_patch<>'{}'::jsonb then
    effective_patch:=p_customer_patch;
    if p_customer_patch->>'phase'='初指名' then effective_patch:=effective_patch||jsonb_build_object('phase_shoshimei_at',now()); end if;
    select string_agg(format('%I=r.%I',key,key),',' order by key) into set_columns from jsonb_object_keys(effective_patch) as key;
    execute format('update public.customers c set %s from jsonb_populate_record(null::public.customers,$1) r where c.id=$2 returning c.*',set_columns)
      into c using to_jsonb(c)||effective_patch,p_customer_id;
    if c.nomination_status is distinct from old_customer_status then
      select id into assigned_cast_id from public.profiles where role='cast' and cast_name=c.cast_name order by id limit 1;
      insert into public.nomination_history(customer_id,cast_id,old_status,new_status)
        values(p_customer_id,coalesce(assigned_cast_id,p_actor_id),old_customer_status,c.nomination_status);
    end if;
  end if;
  update public.customer_visits set nomination_status_at_visit=p_new_visit_status where id=p_visit_id returning * into v;
  insert into public.customer_visit_nomination_corrections(
    customer_id,visit_id,visit_date,old_status,new_status,revision,actor_id,actor_name,request_id,request_fingerprint
  ) values(
    p_customer_id,p_visit_id,v.visit_date,p_expected_visit_status,p_new_visit_status,current_revision+1,p_actor_id,
    coalesce(nullif(actor.display_name,''),nullif(actor.cast_name,''),'スタッフ'),p_request_id,fingerprint
  ) returning * into saved;
  perform pg_catalog.set_config('request.jwt.claims',coalesce(old_claims,''),true);
  perform pg_catalog.set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform pg_catalog.set_config('app.rank_operation',coalesce(old_rank_operation,''),true);
  return jsonb_build_object('customer',to_jsonb(c),'visit',to_jsonb(v),
    'correction',to_jsonb(saved)-'request_fingerprint'-'request_id');
end $$;
revoke all on function public.correct_customer_visit_nomination(uuid,bigint,jsonb,text,bigint,date,text,text,integer,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.correct_customer_visit_nomination(uuid,bigint,jsonb,text,bigint,date,text,text,integer,uuid,boolean)
  to service_role;
comment on table public.customer_visit_nomination_corrections is
  '明示的な来店時指名区分の訂正履歴。時刻による自動補正・既存来店の一括変更は行わない。';
commit;
