-- v0.3.105: 来店直後の「場内 → 本指名」を、その来店の指名スナップショットへ反映する。
--
-- 顧客詳細の保存は、来店実績の保存と指名変更履歴の登録が別リクエストになる。
-- そのため来店を保存した直後に本指名へ変更すると、画面上は現在値で本指名でも
-- customer_visits.nomination_status_at_visit は場内のまま残り、ボウズ判定とずれていた。
-- 10分以内に続けて行われた場内→本指名だけを「同じ登録作業」とみなし、直前に
-- 保存された実来店1件を本指名へ補正する。過去の他の来店は変更しない。

create or replace function public.sync_recent_visit_nomination_from_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_visit_id bigint;
begin
  if new.old_status = '場内' and new.new_status = '本指名' then
    select v.id
    into target_visit_id
    from public.customer_visits v
    where v.customer_id = new.customer_id
      and v.is_planned is not true
      and v.created_at <= new.changed_at
      and v.created_at >= new.changed_at - interval '10 minutes'
    order by v.created_at desc, v.id desc
    limit 1;

    if target_visit_id is not null then
      update public.customer_visits
      set nomination_status_at_visit = '本指名'
      where id = target_visit_id
        and nomination_status_at_visit = '場内';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_recent_visit_nomination_from_history()
  from public, anon, authenticated, service_role;

drop trigger if exists nomination_history_sync_recent_visit_nomination
  on public.nomination_history;
create trigger nomination_history_sync_recent_visit_nomination
after insert on public.nomination_history
for each row
execute function public.sync_recent_visit_nomination_from_history();

-- v0.3.99以降に発生済みの同じ保存順序も、一度だけ同じ条件で補正する。
with matched_visits as (
  select distinct latest_visit.id
  from public.nomination_history nh
  cross join lateral (
    select v.id, v.nomination_status_at_visit
    from public.customer_visits v
    where v.customer_id = nh.customer_id
      and v.is_planned is not true
      and v.created_at >= timestamptz '2026-08-29 00:00:00+09:00'
      and v.created_at <= nh.changed_at
      and v.created_at >= nh.changed_at - interval '10 minutes'
    order by v.created_at desc, v.id desc
    limit 1
  ) latest_visit
  where nh.old_status = '場内'
    and nh.new_status = '本指名'
    and latest_visit.nomination_status_at_visit = '場内'
)
update public.customer_visits v
set nomination_status_at_visit = '本指名'
from matched_visits matched
where v.id = matched.id;

comment on function public.sync_recent_visit_nomination_from_history() is
  '場内から本指名への変更が実来店保存後10分以内なら、直前の来店スナップショットだけを本指名へ補正する。';
