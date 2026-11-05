-- 会議専用の手入力repeatを追加する。顧客のリピート判定・来店・売上とは連携しない。
-- 変更は以下3関数の定義のみ。既存records/テーブル/RLS/ACL/trigger構造は変更しない。
-- 1) values validator: 従来17項目とrepeat:booleanを加えた18項目を両方許可。
-- 2) 監査trigger関数: 初回保存資格を現在の⭐️場内・本指名へ拡張。担当境界は維持。
-- 3) 保存RPC: 欠落=falseの比較、旧requestの再送互換、旧端末訂正時の既存repeat保持。
-- 適用順: このmigration → 読取りverification → アプリ公開。
begin;
create or replace function public.customer_meeting_values_valid(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path=public,pg_temp as $$
declare k text; lim integer;
begin
  if v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>40000 then return false; end if;
  if (select count(*) from jsonb_object_keys(v - 'repeat'))<>17 or v - array['priority','in_time','out_time','table_number','party_size','honshimei','nomination_route','after_place','after_casts','next_info','contact_content','follow_period','thank_you','rally','action','repeat','meeting_amount','meeting_unit_price'] <> '{}'::jsonb then return false; end if;
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
  if v ? 'repeat' and jsonb_typeof(v->'repeat')<>'boolean' then return false; end if;
  return true;
end $$;
revoke all on function public.customer_meeting_values_valid(jsonb) from public,anon;
grant execute on function public.customer_meeting_values_valid(jsonb) to authenticated,service_role;

-- 初回資格だけを拡張し、実来店/担当/権限/版/監査情報の再検証は維持する。
create or replace function public.stamp_customer_meeting_record() returns trigger
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
  if previous.id is null and (c.is_starred is not true or coalesce(c.nomination_status,'') not in ('場内','本指名')) then raise exception '初回記録は現在の⭐️場内・本指名のお客様の実来店のみ作成できます' using errcode='42501'; end if;
  select id,display_name,cast_name into p from public.profiles where id=auth.uid() and is_active;
  if p.id is null or not public.star_log_access(new.customer_id,true) then raise exception '担当または権限が変わっています' using errcode='42501'; end if;
  new.id:=gen_random_uuid(); new.revision:=new.base_revision+1; new.visit_date:=v.visit_date;
  new.actor_id:=p.id; new.actor_name:=coalesce(nullif(p.display_name,''),nullif(p.cast_name,''),'スタッフ'); new.created_at:=clock_timestamp();
  new.customer_snapshot:=jsonb_build_object('id',c.id::text,'customer_name',c.customer_name,'nickname',c.nickname,'region',c.region,'age_group',c.age_group,'occupation',c.occupation,'cast_name',c.cast_name,'nomination_status',c.nomination_status,'is_starred',c.is_starred,'nomination_route',c.nomination_route);
  new.has_after:=coalesce(v.has_after,false);
  return new;
end $$;
revoke all on function public.stamp_customer_meeting_record() from public,anon,authenticated;

-- 認可/実来店再検証/版競合/監査情報の生成/追記専用権限は従来どおり。
create or replace function public.save_customer_meeting(p_customer_id bigint,p_visit_id bigint,p_expected_visit_date date,p_expected_revision integer,p_request_id uuid,p_values jsonb)
returns public.customer_meeting_records language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing public.customer_meeting_records%rowtype; previous public.customer_meeting_records%rowtype; saved public.customer_meeting_records%rowtype; v record; effective_values jsonb;
begin
  if auth.uid() is null or not public.star_log_access(p_customer_id,true) then raise exception 'このお客様の会議記録を編集できません' using errcode='42501'; end if;
  if not public.customer_meeting_values_valid(p_values) or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=2147483647 or p_request_id is null or p_expected_visit_date is null then raise exception '会議入力の形式が不正です' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_meeting:'||p_visit_id::text,0));
  perform 1 from public.customers where id=p_customer_id for share;
  if not found or not public.star_log_access(p_customer_id,true) then raise exception '担当または権限が変わっています' using errcode='42501'; end if;
  select * into existing from public.customer_meeting_records where request_id=p_request_id;
  if existing.id is not null then
    if existing.actor_id<>auth.uid() or existing.customer_id<>p_customer_id or existing.visit_id<>p_visit_id or existing.base_revision<>p_expected_revision or existing.visit_date<>p_expected_visit_date or (case when p_values ? 'repeat'
      then (existing."values" || jsonb_build_object('repeat',coalesce(existing."values"->'repeat','false'::jsonb)))<>p_values
      else existing."values" - 'repeat'<>p_values end) then raise exception '保存リクエストが別の入力に使用されています' using errcode='22023'; end if;
    return existing;
  end if;
  select id,customer_id,visit_date,is_planned into v from public.customer_visits where id=p_visit_id and customer_id=p_customer_id for share;
  if v.id is null or v.is_planned is true or v.visit_date is distinct from p_expected_visit_date or v.visit_date>timezone('Asia/Tokyo',now())::date then raise exception '元の来店情報が変更されています。入力を残して再取得してください' using errcode='40001'; end if;
  select * into previous from public.customer_meeting_records where visit_id=p_visit_id order by revision desc limit 1;
  if coalesce(previous.revision,0)<>p_expected_revision or (previous.id is not null and (previous.customer_id<>p_customer_id or previous.visit_date<>p_expected_visit_date)) then raise exception '会議記録が変更されています。入力を残して履歴を再取得してください' using errcode='40001'; end if;
  -- 旧端末の17項目requestは既存repeatを保持する。他項目の訂正でチェックを消さない。
  -- 過去行の欠落=falseは比較時だけ補完し、保存済みJSON自体を更新しない。
  effective_values:=p_values;
  if not (p_values ? 'repeat') and previous.id is not null and previous."values" ? 'repeat' then
    effective_values:=p_values || jsonb_build_object('repeat',previous."values"->'repeat');
  end if;
  if previous.id is not null and
    (previous."values" || jsonb_build_object('repeat',coalesce(previous."values"->'repeat','false'::jsonb)))=
    (effective_values || jsonb_build_object('repeat',coalesce(effective_values->'repeat','false'::jsonb))) then return previous; end if;
  insert into public.customer_meeting_records(customer_id,visit_id,expected_visit_date,base_revision,request_id,"values") values(p_customer_id,p_visit_id,p_expected_visit_date,p_expected_revision,p_request_id,effective_values) returning * into saved;
  return saved;
end $$;
revoke all on function public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb) from public,anon;
grant execute on function public.save_customer_meeting(bigint,bigint,date,integer,uuid,jsonb) to authenticated,service_role;
commit;
