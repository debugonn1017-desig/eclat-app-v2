-- ═══════════════════════════════════════════════════════════════════
--  顧客ランク自動判定 V2: ランクごとに別々の条件ルール
-- ═══════════════════════════════════════════════════════════════════
-- v1 (既存): monthly_*_threshold / cumulative_*_threshold / 補正項目で判定
-- v2 (新):   rank_rules JSONB に S/A/B 各ランクのルールを格納
--            rank_rules が NULL のときは v1 ロジックにフォールバック
--
-- 適用: Supabase ダッシュボード → SQL Editor → 全文を貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① rank_criteria に rank_rules カラム追加 ────────────────
alter table public.rank_criteria
  add column if not exists rank_rules jsonb default null;

comment on column public.rank_criteria.rank_rules is
  'V2 ランク判定ルール。{S:RankRule, A:RankRule, B:RankRule} 形式。NULL なら V1 ロジック (monthly_*_threshold 等) で判定。';

-- ─── ② JSON 構造の軽い CHECK (緩めにかける) ─────────────────
alter table public.rank_criteria
  drop constraint if exists rank_criteria_rank_rules_shape;

alter table public.rank_criteria
  add constraint rank_criteria_rank_rules_shape
  check (
    rank_rules is null
    or (
      jsonb_typeof(rank_rules) = 'object'
      and rank_rules ? 'S'
      and rank_rules ? 'A'
      and rank_rules ? 'B'
    )
  );

-- ─── ③ default スコープに初期値を seed (まだ rank_rules=NULL のとき) ───
update public.rank_criteria
set rank_rules = '{
  "S": {
    "combine": "all",
    "conditions": [
      {"field": "unit_price",         "op": "gte", "value": 200000, "enabled": true},
      {"field": "cumulative_sales",   "op": "gte", "value": 5000000, "enabled": false},
      {"field": "monthly_avg_sales",  "op": "gte", "value": 300000, "enabled": false},
      {"field": "cumulative_visits",  "op": "gte", "value": 50, "enabled": false},
      {"field": "monthly_avg_visits", "op": "gte", "value": 3, "enabled": false},
      {"field": "tenure_months",      "op": "gte", "value": 12, "enabled": false},
      {"field": "douhan_count",       "op": "gte", "value": 5, "enabled": false},
      {"field": "douhan_rate",        "op": "gte", "value": 30, "enabled": false},
      {"field": "after_count",        "op": "gte", "value": 3, "enabled": false},
      {"field": "after_rate",         "op": "gte", "value": 20, "enabled": false},
      {"field": "days_since_last_visit", "op": "lte", "value": 30, "enabled": false},
      {"field": "recent_trend_ratio", "op": "gte", "value": 1.5, "enabled": false}
    ]
  },
  "A": {
    "combine": "all",
    "conditions": [
      {"field": "monthly_avg_visits", "op": "gte", "value": 3, "enabled": true},
      {"field": "unit_price",         "op": "gte", "value": 0, "enabled": false},
      {"field": "cumulative_sales",   "op": "gte", "value": 0, "enabled": false},
      {"field": "monthly_avg_sales",  "op": "gte", "value": 0, "enabled": false},
      {"field": "cumulative_visits",  "op": "gte", "value": 0, "enabled": false},
      {"field": "tenure_months",      "op": "gte", "value": 0, "enabled": false},
      {"field": "douhan_count",       "op": "gte", "value": 0, "enabled": false},
      {"field": "douhan_rate",        "op": "gte", "value": 0, "enabled": false},
      {"field": "after_count",        "op": "gte", "value": 0, "enabled": false},
      {"field": "after_rate",         "op": "gte", "value": 0, "enabled": false},
      {"field": "days_since_last_visit", "op": "lte", "value": 30, "enabled": false},
      {"field": "recent_trend_ratio", "op": "gte", "value": 1.0, "enabled": false}
    ]
  },
  "B": {
    "combine": "any",
    "conditions": [
      {"field": "monthly_avg_sales",  "op": "gte", "value": 90000, "enabled": true},
      {"field": "days_since_last_visit", "op": "lte", "value": 30, "enabled": true},
      {"field": "unit_price",         "op": "gte", "value": 0, "enabled": false},
      {"field": "cumulative_sales",   "op": "gte", "value": 0, "enabled": false},
      {"field": "cumulative_visits",  "op": "gte", "value": 0, "enabled": false},
      {"field": "monthly_avg_visits", "op": "gte", "value": 0, "enabled": false},
      {"field": "tenure_months",      "op": "gte", "value": 0, "enabled": false},
      {"field": "douhan_count",       "op": "gte", "value": 0, "enabled": false},
      {"field": "douhan_rate",        "op": "gte", "value": 0, "enabled": false},
      {"field": "after_count",        "op": "gte", "value": 0, "enabled": false},
      {"field": "after_rate",         "op": "gte", "value": 0, "enabled": false},
      {"field": "recent_trend_ratio", "op": "gte", "value": 0, "enabled": false}
    ]
  }
}'::jsonb
where scope_type = 'default' and rank_rules is null;

-- ─── ④ 検証 ───────────────────────────────────────────────────
-- select scope_type, scope_id, rank_rules->'S'->'conditions' as s_conditions
--   from public.rank_criteria where rank_rules is not null;
