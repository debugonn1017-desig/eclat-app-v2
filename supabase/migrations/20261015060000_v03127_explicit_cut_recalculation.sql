-- 明示的な再評価だけは手動/履歴なしの切れたを含める。既存の顧客ランクは更新しない。
BEGIN;
ALTER TABLE public.customer_rank_history DROP CONSTRAINT customer_rank_history_operation_check;
ALTER TABLE public.customer_rank_history ADD CONSTRAINT customer_rank_history_operation_check
  CHECK (operation IN ('manual','auto','recalculate','review_restore','review_keep','undo'));

CREATE OR REPLACE FUNCTION public.apply_customer_rank(p_id bigint,p_expected jsonb,p_next_rank text,p_operation text,p_actor uuid,p_origin text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_row public.customers%ROWTYPE; result jsonb;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('auto','recalculate','review_restore','review_keep','undo') OR
     (p_next_rank IS NULL AND p_operation<>'undo') OR
     (p_next_rank IS NOT NULL AND p_next_rank NOT IN ('S','A','B','C','切れた')) OR
     (p_operation='undo' AND (p_origin IS NULL OR p_origin NOT IN ('unknown','manual','auto'))) THEN
    RAISE EXCEPTION 'INVALID_RANK_OPERATION';
  END IF;
  SELECT * INTO current_row FROM public.customers WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RANK_CONFLICT' USING ERRCODE='40001'; END IF;
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
  -- 新しい再評価は本指名限定。実来店未記録の切れたを既定値だけで復帰させない。
  IF p_operation='recalculate' AND (current_row.nomination_status IS DISTINCT FROM '本指名' OR
     (current_row.customer_rank='切れた' AND NOT EXISTS(SELECT 1 FROM public.customer_visits
       WHERE customer_id=p_id AND is_planned IS DISTINCT FROM true
         AND visit_date<=(now() AT TIME ZONE 'Asia/Tokyo')::date))) THEN
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
-- CREATE OR REPLACEは既存のサービス専用実行権限を維持。RLS/権限の拡大なし。
COMMIT;
