-- v0.3.92: 来店時点の指名状況を保存し、過去月の本指名実績を固定する。
-- 既存アプリとの共存を優先し、nullable の追加列と trigger だけを追加する。

alter table public.customer_visits
  add column if not exists nomination_status_at_visit text;

comment on column public.customer_visits.nomination_status_at_visit is
  '来店が実績として登録された時点の指名状況。過去期間の集計を現在値の変更から守る。';

alter table public.customer_visits
  drop constraint if exists customer_visits_nomination_status_at_visit_check;
alter table public.customer_visits
  add constraint customer_visits_nomination_status_at_visit_check
  check (
    nomination_status_at_visit is null
    or nomination_status_at_visit in ('フリー', '場内', '本指名')
  );

-- 履歴がある場合は「来店時刻のJST時点」の状態を優先する。
-- 時刻未登録はその日の終端として扱い、既存の来店ログ統合と同じ規約にする。
-- それ以前の履歴が無い古い来店は、直後の履歴の old_status、それも無ければ現在値で補完する。
update public.customer_visits v
set nomination_status_at_visit = coalesce(
  (
    select nh.new_status
    from public.nomination_history nh
    where nh.customer_id = v.customer_id
      and nh.new_status in ('フリー', '場内', '本指名')
      and nh.changed_at <= (
        (v.visit_date::text || ' ' || coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59'))::timestamp
        at time zone 'Asia/Tokyo'
      )
    order by nh.changed_at desc, nh.id desc
    limit 1
  ),
  (
    select nh.old_status
    from public.nomination_history nh
    where nh.customer_id = v.customer_id
      and nh.changed_at > (
        (v.visit_date::text || ' ' || coalesce(to_char(v.visit_time, 'HH24:MI:SS'), '23:59:59'))::timestamp
        at time zone 'Asia/Tokyo'
      )
      and nh.old_status in ('フリー', '場内', '本指名')
    order by nh.changed_at asc, nh.id asc
    limit 1
  ),
  (
    select case
      when c.nomination_status in ('フリー', '場内', '本指名') then c.nomination_status
      else null
    end
    from public.customers c
    where c.id = v.customer_id
  )
)
where v.nomination_status_at_visit is null;

create or replace function public.snapshot_customer_visit_nomination_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_time timestamptz;
begin
  if (tg_op = 'INSERT' and new.nomination_status_at_visit is null)
     or (tg_op = 'UPDATE' and (
       new.customer_id is distinct from old.customer_id
       or new.visit_date is distinct from old.visit_date
       or new.visit_time is distinct from old.visit_time
       or (old.is_planned is true and new.is_planned is not true)
     )) then
    snapshot_time := (
      (new.visit_date::text || ' ' || coalesce(to_char(new.visit_time, 'HH24:MI:SS'), '23:59:59'))::timestamp
      at time zone 'Asia/Tokyo'
    );
    select coalesce(
      (
        select nh.new_status
        from public.nomination_history nh
        where nh.customer_id = new.customer_id
          and nh.new_status in ('フリー', '場内', '本指名')
          and nh.changed_at <= snapshot_time
        order by nh.changed_at desc, nh.id desc
        limit 1
      ),
      (
        select nh.old_status
        from public.nomination_history nh
        where nh.customer_id = new.customer_id
          and nh.old_status in ('フリー', '場内', '本指名')
          and nh.changed_at > snapshot_time
        order by nh.changed_at asc, nh.id asc
        limit 1
      ),
      (
        select case
          when c.nomination_status in ('フリー', '場内', '本指名') then c.nomination_status
          else null
        end
        from public.customers c
        where c.id = new.customer_id
      )
    ) into new.nomination_status_at_visit;
  end if;
  return new;
end;
$$;

revoke all on function public.snapshot_customer_visit_nomination_status() from public, anon, authenticated;

drop trigger if exists customer_visits_snapshot_nomination_status on public.customer_visits;
create trigger customer_visits_snapshot_nomination_status
before insert or update of customer_id, visit_date, visit_time, is_planned
on public.customer_visits
for each row
execute function public.snapshot_customer_visit_nomination_status();

create index if not exists idx_customer_visits_nomination_date
  on public.customer_visits (nomination_status_at_visit, visit_date, customer_id)
  where is_planned is not true;
