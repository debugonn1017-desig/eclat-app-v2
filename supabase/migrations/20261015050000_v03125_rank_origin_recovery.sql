-- 既存ランクは書き換えない。unknown は手動/自動を推測しない既存記録。
BEGIN;
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_rank_origin text NOT NULL DEFAULT 'unknown'
    CHECK (customer_rank_origin IN ('unknown','manual','auto')),
  ADD COLUMN IF NOT EXISTS customer_rank_revision bigint NOT NULL DEFAULT 0
    CHECK (customer_rank_revision >= 0 AND customer_rank_revision < 9007199254740991);

CREATE TABLE public.customer_rank_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  revision bigint NOT NULL,
  from_rank text, to_rank text,
  from_origin text NOT NULL, to_origin text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('manual','auto','review_restore','review_keep','undo')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id, revision)
);
ALTER TABLE public.customer_rank_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_rank_history_read ON public.customer_rank_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.customers c WHERE c.id=customer_id)
    AND (public.current_role()='cast' OR public.staff_has_permission('顧客.閲覧')));
REVOKE ALL ON public.customer_rank_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.customer_rank_history TO authenticated;
GRANT ALL ON public.customer_rank_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.customer_rank_history_id_seq TO service_role;

CREATE FUNCTION public.customer_rank_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op text := nullif(current_setting('app.rank_operation',true),'');
BEGIN
  IF op IS NOT NULL AND current_setting('role',true)<>'service_role' AND
     coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'RANK_METADATA_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.customer_rank_origin := CASE WHEN NEW.customer_rank IS NULL THEN 'unknown' ELSE 'manual' END;
    NEW.customer_rank_revision := 0;
    RETURN NEW;
  END IF;
  IF op IS NULL AND (NEW.customer_rank_origin IS DISTINCT FROM OLD.customer_rank_origin
       OR NEW.customer_rank_revision IS DISTINCT FROM OLD.customer_rank_revision) THEN
    RAISE EXCEPTION 'RANK_METADATA_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF NEW.customer_rank IS DISTINCT FROM OLD.customer_rank OR
     (op IS NOT NULL AND NEW.customer_rank_origin IS DISTINCT FROM OLD.customer_rank_origin) THEN
    IF op IS NULL THEN NEW.customer_rank_origin := 'manual'; END IF;
    NEW.customer_rank_revision := OLD.customer_rank_revision+1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_rank_guard BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customer_rank_guard();

CREATE FUNCTION public.customer_rank_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op text := coalesce(nullif(current_setting('app.rank_operation',true),''),'manual');
BEGIN
  IF NEW.customer_rank_revision IS DISTINCT FROM OLD.customer_rank_revision THEN
    INSERT INTO public.customer_rank_history(customer_id,revision,from_rank,to_rank,from_origin,to_origin,operation,actor_id)
      VALUES(NEW.id,NEW.customer_rank_revision,OLD.customer_rank,NEW.customer_rank,
        OLD.customer_rank_origin,NEW.customer_rank_origin,op,
        CASE WHEN op='manual' THEN auth.uid() ELSE nullif(current_setting('app.rank_actor',true),'')::uuid END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER customer_rank_log AFTER UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.customer_rank_log();

-- JSONB はプレビューと反映時に同じ定義で取得。日付/履歴/担当/ルールの変更も検出。
CREATE FUNCTION public.customer_rank_snapshot(p_id bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
   'customer',jsonb_build_object('id',c.id,'customer_name',c.customer_name,'cast_name',c.cast_name,
     'nomination_status',c.nomination_status,'first_visit_date',c.first_visit_date,
     'customer_rank',c.customer_rank,'customer_rank_origin',c.customer_rank_origin,'customer_rank_revision',c.customer_rank_revision),
   'visits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'visit_date',v.visit_date,'amount_spent',v.amount_spent,
     'is_planned',v.is_planned,'has_douhan',v.has_douhan,'has_after',v.has_after) ORDER BY v.id)
     FROM public.customer_visits v WHERE v.customer_id=c.id),'[]'::jsonb),
   'criteria',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.rank_criteria r),'[]'::jsonb),
   'cast',(SELECT jsonb_build_object('id',p.id,'cast_tier',p.cast_tier) FROM public.profiles p
     WHERE p.role='cast' AND p.cast_name=c.cast_name ORDER BY p.id LIMIT 1))
 FROM public.customers c WHERE c.id=p_id
$$;
CREATE FUNCTION public.customer_rank_snapshots(p_ids bigint[]) RETURNS SETOF jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.customer_rank_snapshot(id) FROM unnest(p_ids) id
$$;

CREATE FUNCTION public.apply_customer_rank(p_id bigint,p_expected jsonb,p_next_rank text,p_operation text,p_actor uuid,p_origin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_row public.customers%ROWTYPE; result jsonb;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('auto','review_restore','review_keep','undo') OR
     (p_next_rank IS NULL AND p_operation<>'undo') OR
     (p_next_rank IS NOT NULL AND p_next_rank NOT IN ('S','A','B','C','切れた')) OR
     (p_operation='undo' AND (p_origin IS NULL OR p_origin NOT IN ('unknown','manual','auto'))) THEN
    RAISE EXCEPTION 'INVALID_RANK_OPERATION';
  END IF;
  SELECT * INTO current_row FROM public.customers WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RANK_CONFLICT' USING ERRCODE='40001'; END IF;
  -- 親のFOR UPDATEはFKの新規来店挿入も直列化する。既存来店・ルールも保護。
  PERFORM id FROM public.customer_visits WHERE customer_id=p_id FOR SHARE;
  LOCK TABLE public.rank_criteria IN SHARE MODE;
  LOCK TABLE public.profiles IN SHARE MODE;
  IF public.customer_rank_snapshot(p_id) IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION 'RANK_CONFLICT' USING ERRCODE='40001';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND is_active=true) THEN
    RAISE EXCEPTION 'RANK_ACTOR_INVALID' USING ERRCODE='42501';
  END IF;
  IF p_operation='auto' AND (current_row.nomination_status IS DISTINCT FROM '本指名' OR
     (current_row.customer_rank='切れた' AND current_row.customer_rank_origin<>'auto')) THEN
    RAISE EXCEPTION 'RANK_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF p_operation='review_restore' AND (current_row.customer_rank IS DISTINCT FROM '切れた' OR
     current_row.customer_rank_origin='manual' OR current_row.nomination_status IS DISTINCT FROM '本指名' OR p_next_rank='切れた') THEN
    RAISE EXCEPTION 'RANK_PROTECTED' USING ERRCODE='42501';
  END IF;
  IF p_operation='review_keep' AND (current_row.customer_rank IS DISTINCT FROM '切れた' OR p_next_rank<>'切れた') THEN
    RAISE EXCEPTION 'RANK_PROTECTED' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.rank_operation',p_operation,true);
  PERFORM set_config('app.rank_actor',p_actor::text,true);
  UPDATE public.customers SET customer_rank=p_next_rank,
    customer_rank_origin=CASE WHEN p_operation='undo' THEN p_origin WHEN p_operation='review_keep' THEN 'manual' ELSE 'auto' END
    WHERE id=p_id RETURNING to_jsonb(customers.*) INTO result;
  PERFORM set_config('app.rank_operation','',true);
  PERFORM set_config('app.rank_actor','',true);
  RETURN result;
END $$;
CREATE FUNCTION public.apply_customer_rank_batch(p_changes jsonb,p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE item jsonb; result jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)>50 THEN RAISE EXCEPTION 'INVALID_RANK_BATCH'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_changes) ORDER BY (value->>'p_id')::bigint LOOP
    BEGIN
      PERFORM public.apply_customer_rank((item->>'p_id')::bigint,item->'p_expected',item->>'p_next_rank',
        item->>'p_operation',p_actor,item->>'p_origin');
      result:=result||jsonb_build_array(jsonb_build_object('id',item->>'p_id','ok',true));
    EXCEPTION WHEN OTHERS THEN
      result:=result||jsonb_build_array(jsonb_build_object('id',item->>'p_id','ok',false,'error',
        CASE WHEN SQLSTATE IN ('40001','42501') THEN 'データが変更されたか保護対象です。再確認してください' ELSE '保存できませんでした' END));
    END;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.customer_rank_snapshot(bigint), public.customer_rank_snapshots(bigint[]),
  public.apply_customer_rank(bigint,jsonb,text,text,uuid,text), public.apply_customer_rank_batch(jsonb,uuid), public.customer_rank_guard(), public.customer_rank_log()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_rank_snapshot(bigint), public.customer_rank_snapshots(bigint[]),
  public.apply_customer_rank(bigint,jsonb,text,text,uuid,text), public.apply_customer_rank_batch(jsonb,uuid) TO service_role;

-- 既存ビューの列順・売上集計は維持。最終来店日だけ0円を含む実来店に統一。
DO $$ DECLARE definition text; BEGIN
  definition := pg_get_viewdef('public.customer_search_metrics'::regclass,true);
  IF position('max(customer_visits.visit_date) AS last_visit_date' in definition)=0 THEN
    RAISE EXCEPTION 'customer_search_metrics view definition changed: inspect before migration';
  END IF;
  definition := replace(definition,'max(customer_visits.visit_date) AS last_visit_date',
    'max(customer_visits.visit_date) FILTER (WHERE customer_visits.is_planned IS NOT TRUE AND customer_visits.visit_date <= (now() AT TIME ZONE ''Asia/Tokyo'')::date) AS last_visit_date');
  definition := rtrim(definition, E';\n ');
  EXECUTE 'CREATE OR REPLACE VIEW public.customer_search_metrics WITH (security_invoker=true) AS SELECT metrics.*, customer.customer_rank_origin, customer.customer_rank_revision FROM ('||definition||') metrics JOIN public.customers customer ON customer.id=metrics.id';
END $$;
COMMIT;
