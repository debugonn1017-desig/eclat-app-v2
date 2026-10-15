-- 読み取りのみ。全ての検証結果が期待どおりであることを反映後に確認する。
select relname,relrowsecurity from pg_class where oid in (
  'public.customer_star_cycles'::regclass,'public.customer_star_logs'::regclass
);
select has_table_privilege('authenticated','public.customer_star_cycles','SELECT') as authenticated_read,
  has_table_privilege('authenticated','public.customer_star_logs','INSERT') as direct_insert_must_be_false,
  has_table_privilege('authenticated','public.customer_star_logs','DELETE') as direct_delete_must_be_false;
select has_function_privilege('authenticated','public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid)','EXECUTE') as authenticated_record,
  has_function_privilege('anon','public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid)','EXECUTE') as anon_record_must_be_false;
select count(*) as missing_active_cycle_must_be_zero from public.customers c
where c.is_starred and not exists(select 1 from public.customer_star_cycles cy where cy.customer_id=c.id and cy.ended_at is null);
select count(*) as active_cycle_without_star_must_be_zero from public.customer_star_cycles cy
join public.customers c on c.id=cy.customer_id where cy.ended_at is null and not c.is_starred;
select count(*) as trigger_count_must_be_one from pg_trigger where tgrelid='public.customers'::regclass
and tgname='capture_customer_star_cycle' and not tgisinternal;
select proname,prosecdef,proconfig from pg_proc where oid in (
  'public.star_log_access(bigint,boolean)'::regprocedure,
  'public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid)'::regprocedure,
  'public.restart_customer_star(bigint,uuid,uuid)'::regprocedure
);
