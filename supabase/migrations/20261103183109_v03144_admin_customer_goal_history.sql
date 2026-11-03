-- 管理者の旧担当目標履歴は閲覧だけ許可する。INSERT/UPDATEのポリシー・列権限は変更しない。
begin;
alter policy monthly_goals_read on public.customer_monthly_goals to authenticated using (
  public.star_log_access(customer_id,false)
  and exists (
    select 1 from public.profiles p
    where p.id=customer_monthly_goals.cast_id and p.role='cast'
    and (
      exists (
        select 1 from public.profiles viewer
        where viewer.id=(select auth.uid()) and viewer.role='admin' and viewer.is_active
      )
      or (
        p.id=(select auth.uid()) and p.is_active
        and exists (
          select 1 from public.customers c
          where c.id=customer_monthly_goals.customer_id and c.cast_name=p.cast_name
        )
      )
    )
  )
);
commit;
