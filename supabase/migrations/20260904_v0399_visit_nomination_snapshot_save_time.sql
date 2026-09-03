-- v0.3.99: 来店実績を保存した時点の指名状況を固定する。
--
-- v0.3.92 では visit_date / visit_time 時点の履歴から指名状況を復元していたが、
-- 夜間営業後に「場内 → 本指名」へ変更してから日別売上を保存する運用では、
-- 保存時点で本指名でも来店時刻時点の場内が固定され、ボウズとして誤集計されていた。
-- 実績登録時の顧客状態を一度だけ保存し、その後の指名変更では過去実績を変えない。

comment on column public.customer_visits.nomination_status_at_visit is
  '実績来店を保存した時点の指名状況。保存後の指名変更から過去期間の集計を守る。';

create or replace function public.snapshot_customer_visit_nomination_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_planned is true or new.nomination_status_at_visit is not null then
      return new;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.is_planned is true or not (
      new.customer_id is distinct from old.customer_id
      or (old.is_planned is true and new.is_planned is not true)
      or new.nomination_status_at_visit is null
    ) then
      return new;
    end if;
  end if;

  if new.is_planned is not true then
    select case
      when c.nomination_status in ('フリー', '場内', '本指名') then c.nomination_status
      else null
    end
    into new.nomination_status_at_visit
    from public.customers c
    where c.id = new.customer_id;
  end if;

  return new;
end;
$$;

revoke all on function public.snapshot_customer_visit_nomination_status() from public, anon, authenticated, service_role;

drop trigger if exists customer_visits_snapshot_nomination_status on public.customer_visits;
create trigger customer_visits_snapshot_nomination_status
before insert or update of customer_id, is_planned, nomination_status_at_visit
on public.customer_visits
for each row
execute function public.snapshot_customer_visit_nomination_status();

-- v0.3.92 導入後に作られた実績のうち、指名変更後に日別売上へ保存された行を補正する。
-- created_at 時点で確定していた最新の指名状態だけを採用し、保存後の変更は遡及させない。
with save_time_status as (
  select
    v.id,
    latest.new_status
  from public.customer_visits v
  cross join lateral (
    select nh.new_status
    from public.nomination_history nh
    where nh.customer_id = v.customer_id
      and nh.changed_at <= v.created_at
      and nh.new_status in ('フリー', '場内', '本指名')
    order by nh.changed_at desc, nh.id desc
    limit 1
  ) latest
  where v.created_at >= timestamptz '2026-08-29 00:00:00+09:00'
    and v.is_planned is not true
    and v.nomination_status_at_visit is distinct from latest.new_status
)
update public.customer_visits v
set nomination_status_at_visit = corrected.new_status
from save_time_status corrected
where v.id = corrected.id;
