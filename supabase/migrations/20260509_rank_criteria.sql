-- ═══════════════════════════════════════════════════════════════════
--  顧客ランク自動判定の基準テーブル
-- ═══════════════════════════════════════════════════════════════════
--
-- お客様の S/A/B/C ランクを「事実（売上・来店頻度・同伴率など）」から
-- 自動算出するための、しきい値・重み・ON/OFF を保持するシングルトン的テーブル。
-- レコードは1行のみ運用、編集はオーナーのみ。
--
-- 適用: Supabase ダッシュボード → SQL Editor → 全文を貼って Run
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.rank_criteria (
  id uuid primary key default gen_random_uuid(),

  -- ─── 月次売上ランク ────────────────────────────────────
  monthly_enabled         boolean default true,
  monthly_s_threshold     integer default 100000,   -- 月10万円
  monthly_a_threshold     integer default 50000,    -- 月5万円
  monthly_b_threshold     integer default 20000,    -- 月2万円
  monthly_period_months   integer default 3,        -- 直近3ヶ月の月平均で算出

  -- ─── 累計売上ランク ────────────────────────────────────
  cumulative_enabled      boolean default true,
  cumulative_s_threshold  integer default 5000000,  -- 累計500万円
  cumulative_a_threshold  integer default 2000000,  -- 累計200万円
  cumulative_b_threshold  integer default 1000000,  -- 累計100万円

  -- ─── 月次と累計の合算方針 ────────────────────────────
  -- 'higher': 高い方を採用 / 'lower': 低い方を採用 / 'monthly_first': 月次優先
  combine_strategy        text default 'lower'
    check (combine_strategy in ('higher', 'lower', 'monthly_first')),

  -- ─── 補正項目（ON のときだけ評価に反映）────────────────
  frequency_enabled              boolean default true,
  frequency_high_threshold       integer default 4,    -- 月4回以上で +1
  frequency_low_threshold        integer default 2,    -- 月2回未満で -1

  douhan_rate_enabled            boolean default true,
  douhan_rate_threshold          integer default 30,   -- 同伴率30%以上で +1

  trend_enabled                  boolean default true,
  trend_up_multiplier            numeric(4,2) default 1.5,  -- 直近3ヶ月が前3ヶ月の1.5倍以上 → +1
  trend_down_multiplier          numeric(4,2) default 0.5,  -- 0.5倍以下 → -1

  unit_price_enabled             boolean default false,
  unit_price_threshold           integer default 50000,  -- 1回5万円以上で +1

  tenure_enabled                 boolean default false,
  tenure_threshold_months        integer default 12,     -- 12ヶ月以上で +1

  after_rate_enabled             boolean default false,
  after_rate_threshold           integer default 20,     -- アフター率20%以上で +1

  -- ─── 非アクティブ判定 ──────────────────────────────────
  inactive_enabled               boolean default true,
  inactive_warning_days          integer default 30,   -- 30日来店なし → -1
  inactive_force_c_days          integer default 90,   -- 90日来店なし → 強制C

  -- ─── 補正の上限 ────────────────────────────────────────
  max_adjustment_steps           integer default 2,    -- 補正は±2段階まで

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ─── 初期レコードを1行だけ挿入（既に存在する場合はスキップ）─────
insert into public.rank_criteria default values
  on conflict do nothing;

-- ─── RLS 設定 ────────────────────────────────────────────────
alter table public.rank_criteria enable row level security;

-- 読み取り: 認証済み全員（モーダルで判定理由を出すのに必要）
drop policy if exists rank_criteria_select_authenticated on public.rank_criteria;
create policy rank_criteria_select_authenticated
  on public.rank_criteria
  for select
  to authenticated
  using (true);

-- 書き換え: オーナーのみ
drop policy if exists rank_criteria_update_owner on public.rank_criteria;
create policy rank_criteria_update_owner
  on public.rank_criteria
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

-- 新規作成: オーナーのみ（基本的に1行運用なので使われない想定だが念のため）
drop policy if exists rank_criteria_insert_owner on public.rank_criteria;
create policy rank_criteria_insert_owner
  on public.rank_criteria
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_owner = true
    )
  );

-- 削除: 禁止（レコード消えると判定不可になるので、オーナーでも消せない方針）

-- ─── updated_at の自動更新トリガ ────────────────────────────
create or replace function public.touch_rank_criteria_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_rank_criteria_updated_at on public.rank_criteria;
create trigger trg_rank_criteria_updated_at
  before update on public.rank_criteria
  for each row execute function public.touch_rank_criteria_updated_at();

-- ─── 確認用 ────────────────────────────────────────────────
-- select * from public.rank_criteria;
