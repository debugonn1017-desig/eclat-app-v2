-- 認可範囲は維持し、ログインIDの取得を各行で繰り返さない。
begin;
alter policy monthly_goals_read on public.customer_monthly_goals to authenticated using (
  public.star_log_access(customer_id,false) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and p.role='cast' and p.is_active
    and (p.id=(select auth.uid()) or (select v.role from public.profiles v where v.id=(select auth.uid()))='admin')
  )
);
alter policy monthly_goals_insert on public.customer_monthly_goals to authenticated with check (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=(select auth.uid()) or (select v.role from public.profiles v where v.id=(select auth.uid()))='admin')
  )
);
alter policy monthly_goals_update on public.customer_monthly_goals to authenticated using (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=(select auth.uid()) or (select v.role from public.profiles v where v.id=(select auth.uid()))='admin')
  )
) with check (
  public.star_log_access(customer_id,true) and exists (
    select 1 from public.customers c join public.profiles p on p.id=customer_monthly_goals.cast_id
    where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name and c.is_starred and p.role='cast' and p.is_active
    and (p.id=(select auth.uid()) or (select v.role from public.profiles v where v.id=(select auth.uid()))='admin')
  )
);
commit;
