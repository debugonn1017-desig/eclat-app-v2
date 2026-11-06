-- 読取のみ。適用前後で既存データの件数・全列指紋が一致することを確認する。
-- migrationは既存行をUPDATEしない。新テーブルの訂正行数は適用直後0。
select 'customers' as dataset,count(*) as rows,md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) as fingerprint from public.customers t
union all
select 'customer_visits',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.customer_visits t
union all
select 'nomination_history',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.nomination_history t
union all
select 'customer_rank_history',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.customer_rank_history t
union all
select 'customer_meeting_records',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by id),'')) from public.customer_meeting_records t
order by dataset;
