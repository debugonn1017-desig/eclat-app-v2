-- v0.3.75: お客様検索の対象にボトル名を追加
--
-- 既存の customer_search_metrics / customer_core_quality は変更せず、
-- ボトル名検索用の文字列列を末尾に加えたラッパービューを作る。
-- SECURITY INVOKER により customers / customer_bottles の既存RLSを維持する。

create or replace view public.customer_search_metrics_with_bottles
with (security_invoker = true)
as
select
  metrics.*,
  lower(concat_ws(' ', metrics.search_text, bottles.bottle_names))
    as search_text_with_bottles
from public.customer_search_metrics metrics
left join (
  select
    customer_id,
    string_agg(btrim(bottle_name), ' ' order by id)
      filter (where nullif(btrim(bottle_name), '') is not null) as bottle_names
  from public.customer_bottles
  group by customer_id
) bottles on bottles.customer_id = metrics.id;

revoke all on table public.customer_search_metrics_with_bottles from public, anon;
grant select on table public.customer_search_metrics_with_bottles to authenticated;

create or replace view public.customer_core_quality_with_bottles
with (security_invoker = true)
as
select
  quality.*,
  lower(concat_ws(' ', quality.search_text, bottles.bottle_names))
    as search_text_with_bottles
from public.customer_core_quality quality
left join (
  select
    customer_id,
    string_agg(btrim(bottle_name), ' ' order by id)
      filter (where nullif(btrim(bottle_name), '') is not null) as bottle_names
  from public.customer_bottles
  group by customer_id
) bottles on bottles.customer_id = quality.id;

revoke all on table public.customer_core_quality_with_bottles from public, anon;
grant select on table public.customer_core_quality_with_bottles to authenticated;
