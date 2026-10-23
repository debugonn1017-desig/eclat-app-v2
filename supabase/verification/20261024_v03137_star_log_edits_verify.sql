-- 読取りのみ。DB移行後、mainのデプロイ前に全項目を確認する。
select relname,relrowsecurity from pg_class where oid in (
  'public.customer_star_cycles'::regclass,'public.customer_star_logs'::regclass,'public.customer_star_log_changes'::regclass
);
select has_function_privilege('authenticated','public.modify_customer_star_log(bigint,uuid,integer,text,date,text,text,uuid)','EXECUTE') as authenticated_modify_must_be_true,
  has_function_privilege('anon','public.modify_customer_star_log(bigint,uuid,integer,text,date,text,text,uuid)','EXECUTE') as anon_modify_must_be_false,
  has_function_privilege('authenticated','public.refresh_star_cycle_check(uuid)','EXECUTE') as direct_refresh_must_be_false;
select has_table_privilege('authenticated','public.customer_star_logs','UPDATE') as direct_update_must_be_false,
  has_table_privilege('authenticated','public.customer_star_logs','DELETE') as direct_delete_must_be_false,
  has_table_privilege('authenticated','public.customer_star_log_changes','SELECT') as audit_read_must_be_false,
  has_table_privilege('service_role','public.customer_star_log_changes','SELECT') as service_audit_must_be_true;
select count(*) as trigger_count_must_be_one from pg_trigger where tgrelid='public.customer_star_logs'::regclass
  and tgname='capture_star_log_check_summary' and not tgisinternal;
select count(*) as summary_mismatches_must_be_zero from public.customer_star_cycles cy
left join lateral (
  select event_on,status,actor_name from public.customer_star_logs where cycle_id=cy.id and kind='check' and deleted_at is null
  order by event_on desc,recorded_at desc,id desc limit 1
) latest on true
where cy.last_checked_on is distinct from latest.event_on or cy.last_status is distinct from latest.status or cy.last_checked_by is distinct from latest.actor_name;
select count(*) as invalid_revisions_must_be_zero from public.customer_star_logs where revision<0;
select proname,prosecdef,proconfig from pg_proc where oid in (
  'public.modify_customer_star_log(bigint,uuid,integer,text,date,text,text,uuid)'::regprocedure,
  'public.refresh_star_cycle_check(uuid)'::regprocedure,
  'public.capture_star_log_check_summary()'::regprocedure,
  'public.record_customer_star_log(bigint,uuid,date,date,date,text,text,uuid)'::regprocedure
);
select policyname,roles,qual from pg_policies where schemaname='public' and tablename='customer_star_logs' and policyname='star_logs_read';
