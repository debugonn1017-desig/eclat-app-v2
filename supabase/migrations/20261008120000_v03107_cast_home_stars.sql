begin;
alter table public.customers add column if not exists is_starred boolean not null default false;
alter table public.customers add column if not exists no_reply boolean not null default false;
alter table public.profiles add column if not exists joined_at date;
alter table public.profiles add column if not exists target_cast_tier text;
alter table public.cast_targets add column if not exists target_avg_spend numeric check (target_avg_spend >= 0);

-- 旧層は手動変更まで保持。追いかけから星への引き継ぎは行わない。
do $$ declare p record; begin
  if exists (
    select 1 from pg_constraint where contype='c' and array_length(conkey,1)>1
    and conrelid in ('public.profiles'::regclass,'public.cast_tier_targets'::regclass)
    and pg_get_constraintdef(oid) like '%tier%'
  ) then raise exception 'キャスト層を含む複合CHECKがあります。既存の他条件を保持する個別確認が必要です'; end if;
  for p in select conname from pg_constraint where conrelid='public.profiles'::regclass and contype='c' and array_length(conkey,1)=1 and pg_get_constraintdef(oid) like '%cast_tier%' loop
    execute format('alter table public.profiles drop constraint %I',p.conname);
  end loop;
  for p in select conname from pg_constraint where conrelid='public.cast_tier_targets'::regclass and contype='c' and array_length(conkey,1)=1 and pg_get_constraintdef(oid) like '%tier%' loop
    execute format('alter table public.cast_tier_targets drop constraint %I',p.conname);
  end loop;
end $$;
alter table public.profiles add constraint profiles_cast_tier_v107_check check (cast_tier in ('AA','AB','AC','BA','BB','BC','新人','無類','C','A層','B層','新人層','C層','その他'));
alter table public.profiles add constraint profiles_target_cast_tier_v107_check check (target_cast_tier in ('AA','AB','AC','BA','BB','BC','新人','無類','C'));
alter table public.cast_tier_targets add constraint cast_tier_targets_tier_v107_check check (tier in ('AA','AB','AC','BA','BB','BC','新人','無類','C','A層','B層','新人層','C層','その他'));

-- 既存ビューの列・集計を保持し、最新のマークを末尾追加する。
do $$ declare def text; begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='customer_search_metrics_with_bottles' and column_name='is_starred') then
    select pg_get_viewdef('public.customer_search_metrics_with_bottles'::regclass,true) into def;
    def := regexp_replace(def,';\s*$','');
    execute 'create or replace view public.customer_search_metrics_with_bottles with (security_invoker=true) as select previous.*, c.is_starred, c.no_reply from (' || def || ') previous join public.customers c on c.id=previous.id';
  end if;
end $$;
revoke all on public.customer_search_metrics_with_bottles from public, anon;
grant select on public.customer_search_metrics_with_bottles to authenticated;
create index if not exists customers_starred_cast_idx on public.customers (cast_name,id) where is_starred;
commit;
