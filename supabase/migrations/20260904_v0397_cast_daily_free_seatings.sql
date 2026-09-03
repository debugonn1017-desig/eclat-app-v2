-- v0.3.97: キャスト別・営業日別のフリー配席数
-- 日次売上入力で手入力し、課題見える化シートの月間一覧で合計する。

create table if not exists public.cast_daily_free_seatings (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.profiles(id) on delete cascade,
  business_date date not null,
  seating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cast_daily_free_seatings_cast_date_key unique (cast_id, business_date),
  constraint cast_daily_free_seatings_count_check check (seating_count between 0 and 999)
);

comment on table public.cast_daily_free_seatings is
  '日次売上入力で記録する、キャストごとのフリー配席数。1キャスト・1営業日につき1行。';
comment on column public.cast_daily_free_seatings.seating_count is
  'その営業日にフリー席へ配席された回数（0〜999）';

create index if not exists cast_daily_free_seatings_date_idx
  on public.cast_daily_free_seatings (business_date, cast_id);

create or replace function public.set_cast_daily_free_seatings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_cast_daily_free_seatings_updated_at() from public, anon, authenticated;

drop trigger if exists cast_daily_free_seatings_updated_at on public.cast_daily_free_seatings;
create trigger cast_daily_free_seatings_updated_at
before update on public.cast_daily_free_seatings
for each row execute function public.set_cast_daily_free_seatings_updated_at();

alter table public.cast_daily_free_seatings enable row level security;

drop policy if exists cast_daily_free_seatings_admin_read on public.cast_daily_free_seatings;
create policy cast_daily_free_seatings_admin_read
  on public.cast_daily_free_seatings
  for select
  to authenticated
  using (public.current_role() = 'admin');

drop policy if exists cast_daily_free_seatings_sales_insert on public.cast_daily_free_seatings;
create policy cast_daily_free_seatings_sales_insert
  on public.cast_daily_free_seatings
  for insert
  to authenticated
  with check (
    public.has_perm_sales_input()
    and exists (
      select 1 from public.profiles target
      where target.id = cast_id and target.role = 'cast'
    )
  );

drop policy if exists cast_daily_free_seatings_sales_update on public.cast_daily_free_seatings;
create policy cast_daily_free_seatings_sales_update
  on public.cast_daily_free_seatings
  for update
  to authenticated
  using (public.has_perm_sales_input())
  with check (
    public.has_perm_sales_input()
    and exists (
      select 1 from public.profiles target
      where target.id = cast_id and target.role = 'cast'
    )
  );

drop policy if exists cast_daily_free_seatings_sales_delete on public.cast_daily_free_seatings;
create policy cast_daily_free_seatings_sales_delete
  on public.cast_daily_free_seatings
  for delete
  to authenticated
  using (public.has_perm_sales_input());

revoke all on table public.cast_daily_free_seatings from public, anon, authenticated;
grant select, insert, update, delete on table public.cast_daily_free_seatings to authenticated;
revoke insert, update, delete, truncate on table public.cast_daily_free_seatings from service_role;
grant select on table public.cast_daily_free_seatings to service_role;
