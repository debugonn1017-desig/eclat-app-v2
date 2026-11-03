-- 月別の⭐️顧客目標。⭐️解除はレコードを削除しない。
begin;
create table public.customer_monthly_goals (
  cast_id uuid not null references public.profiles(id),
  month date not null check (extract(day from month)=1 and month >= date '2000-01-01' and month < date '2200-01-01'),
  customer_id bigint not null references public.customers(id) on delete cascade,
  target_sales integer check (target_sales between 0 and 99999999),
  target_visits integer check (target_visits between 0 and 999),
  note text not null default '' check (char_length(note)<=2000),
  revision integer not null default 1 check (revision>0),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(cast_id,month,customer_id)
);
create index customer_monthly_goals_customer_idx on public.customer_monthly_goals(customer_id);
alter table public.customer_monthly_goals enable row level security;
create policy monthly_goals_read on public.customer_monthly_goals for select to authenticated using (
  public.star_log_access(customer_id,false) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and p.role='cast' and p.is_active
    and (p.id=auth.uid() or (select v.role from public.profiles v where v.id=auth.uid())='admin')
  )
);
create policy monthly_goals_insert on public.customer_monthly_goals for insert to authenticated with check (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=auth.uid() or (select v.role from public.profiles v where v.id=auth.uid())='admin')
  )
);
create policy monthly_goals_update on public.customer_monthly_goals for update to authenticated using (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=auth.uid() or (select v.role from public.profiles v where v.id=auth.uid())='admin')
  )
) with check (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=auth.uid() or (select v.role from public.profiles v where v.id=auth.uid())='admin')
  )
);
create function public.stamp_customer_monthly_goal() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' then
    if row(new.cast_id,new.month,new.customer_id) is distinct from row(old.cast_id,old.month,old.customer_id) then
      raise exception '目標の担当・対象月・お客様は変更できません' using errcode='22023';
    end if;
    new.created_at:=old.created_at; new.created_by:=old.created_by;
    new.revision:=old.revision+1;
  else
    new.created_at:=now(); new.created_by:=auth.uid(); new.revision:=1;
  end if;
  new.updated_at:=now(); new.updated_by:=auth.uid();
  return new;
end $$;
revoke all on function public.stamp_customer_monthly_goal() from public,anon,authenticated;
create trigger stamp_customer_monthly_goal before insert or update on public.customer_monthly_goals
for each row execute function public.stamp_customer_monthly_goal();
revoke all on public.customer_monthly_goals from public,anon,authenticated;
grant select on public.customer_monthly_goals to authenticated;
grant insert(cast_id,month,customer_id,target_sales,target_visits,note) on public.customer_monthly_goals to authenticated;
grant update(target_sales,target_visits,note) on public.customer_monthly_goals to authenticated;
grant all on public.customer_monthly_goals to service_role;
comment on table public.customer_monthly_goals is 'キャスト・顧客・月別の目標と備考。星解除後も保持。実績は実来店から集計。';
commit;
