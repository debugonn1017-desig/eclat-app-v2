-- ═══════════════════════════════════════════════════════════════════
--  パフォーマンス用インデックス追加 (P4 / 2026-05-12)
-- ═══════════════════════════════════════════════════════════════════
-- お客様分析・キャスト分析・ランキング系の頻出クエリを高速化。
-- 既に存在するインデックスは IF NOT EXISTS でスキップ。
-- 適用: Supabase ダッシュボード → SQL Editor → 全文貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ─── customer_visits (最頻出テーブル) ────────────────────────
-- customer_id + visit_date の複合インデックス (来店履歴の範囲取得)
create index if not exists idx_customer_visits_cust_date
  on public.customer_visits(customer_id, visit_date desc);

-- visit_date 単体 (月別集計)
create index if not exists idx_customer_visits_date
  on public.customer_visits(visit_date);

-- ─── customers ──────────────────────────────────────────────
-- cast_name + nomination_status (担当キャストの本指名顧客抽出)
create index if not exists idx_customers_cast_nom
  on public.customers(cast_name, nomination_status);

-- nomination_status + customer_rank (お客様分析の絞り込み)
create index if not exists idx_customers_nom_rank
  on public.customers(nomination_status, customer_rank);

-- last_contact_date (離脱予兆検出)
create index if not exists idx_customers_last_contact
  on public.customers(last_contact_date);

-- ─── nomination_history (転換トラッキング + 自動 Push) ──────
-- cast_id + changed_at + new_status (期間内の遷移検索)
create index if not exists idx_nomination_history_cast_date
  on public.nomination_history(cast_id, changed_at desc);

-- ─── cast_shifts (シフト集計) ──────────────────────────────
-- cast_id + shift_date は既存だが念のため
create index if not exists idx_cast_shifts_cast_date
  on public.cast_shifts(cast_id, shift_date);

-- ─── cast_extension_sales (場内延長売上集計) ───────────────
create index if not exists idx_cast_extension_sales_cast_date
  on public.cast_extension_sales(cast_id, sale_date desc);

-- ─── auto_push_log (重複チェック) ──────────────────────────
-- 既にユニーク制約あるが、cast_id 単独もしっかり貼る
create index if not exists idx_auto_push_log_cast
  on public.auto_push_log(cast_id, month);

-- ─── cast_targets / cast_tier_targets (階層検索) ───────────
-- 既存もあるはずだが念のため
create index if not exists idx_cast_targets_cast_month
  on public.cast_targets(cast_id, month);

create index if not exists idx_cast_tier_targets_tier_month
  on public.cast_tier_targets(tier, month);

-- ─── customer_contacts (連絡履歴) ──────────────────────────
create index if not exists idx_customer_contacts_cust_date
  on public.customer_contacts(customer_id, contact_date desc);

-- ─── 検証 (実行後の確認用) ─────────────────────────────────
-- select indexname, tablename from pg_indexes
--   where schemaname = 'public' and indexname like 'idx_%'
--   order by tablename, indexname;
