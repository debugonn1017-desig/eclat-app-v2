-- ═══════════════════════════════════════════════════════════════════
--  ランク基準・ノルマの階層化 + 新権限2つ追加
-- ═══════════════════════════════════════════════════════════════════
--
-- 1. 新権限「ランク基準.設定」「ノルマ.設定」を staff_permissions の
--    CHECK 制約に追加（誰にも付与しない、is_owner だけ通る運用）
-- 2. rank_criteria に scope_type / scope_id を追加して階層化
-- 3. cast_targets.month を nullable にして「全月共通の個別デフォルト」を可能に
--
-- 適用: Supabase ダッシュボード → SQL Editor → 全文を貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────
-- ① staff_permissions の CHECK 制約を更新（17 → 19 権限）
-- ───────────────────────────────────────────────────────
alter table public.staff_permissions
  drop constraint if exists staff_permissions_permission_check;

alter table public.staff_permissions
  add constraint staff_permissions_permission_check
  check (permission in (
    -- 顧客系
    '顧客.閲覧',
    '顧客.編集',
    '顧客.引継ぎ',
    -- キャスト系
    'キャスト.閲覧',
    'キャスト.アカウント管理',
    -- KPI系
    'KPI.閲覧',
    'KPI.詳細分析',
    -- シフト系
    'シフト.閲覧',
    'シフト.管理',
    -- 売上系
    '売上.閲覧',
    '売上.入力',
    -- お知らせ系
    'お知らせ.閲覧',
    'お知らせ.投稿',
    'お知らせ.管理',
    -- レポート系
    'レポート.閲覧',
    'レポート.出力',
    -- 通知系
    '通知.送信',
    -- 設定系（新規）
    'ランク基準.設定',
    'ノルマ.設定'
  ));

-- ───────────────────────────────────────────────────────
-- ② rank_criteria に scope カラム追加（階層対応）
-- ───────────────────────────────────────────────────────
alter table public.rank_criteria
  add column if not exists scope_type text default 'default'
    check (scope_type in ('default', 'tier', 'cast'));

alter table public.rank_criteria
  add column if not exists scope_id text default null;

-- 既存の1行は default として扱う（明示的に書き込み）
update public.rank_criteria
set scope_type = 'default', scope_id = null
where scope_type is null or (scope_type = 'default' and scope_id is null);

-- ユニーク制約: 同じ scope_type × scope_id の重複を防ぐ
--   default は scope_id null で1行のみ
--   tier は (scope_type='tier', scope_id='A層') 等で各層1行
--   cast は (scope_type='cast', scope_id=castId) で各キャスト1行
create unique index if not exists rank_criteria_scope_uniq
  on public.rank_criteria (scope_type, coalesce(scope_id, ''));

-- ───────────────────────────────────────────────────────
-- ③ cast_targets.month を nullable に（恒久デフォルト用）
-- ───────────────────────────────────────────────────────
-- month=NULL のレコード = 「そのキャストの全月共通の個別デフォルト」
-- month='2026-05' 等 = 「特定月の特例ノルマ」（最優先）
alter table public.cast_targets
  alter column month drop not null;

-- ───────────────────────────────────────────────────────
-- ④ cast_tier_targets.month を nullable に（層デフォルト用）
-- ───────────────────────────────────────────────────────
-- month=NULL のレコード = 「その層の全月共通のデフォルト」
alter table public.cast_tier_targets
  alter column month drop not null;

-- ───────────────────────────────────────────────────────
-- ⑤ cast_tier_targets を cast_targets と同じ項目に揃える
-- ───────────────────────────────────────────────────────
-- これまで売上・出勤日数・指名・新規客 のみだったが、
-- 個別ノルマ画面と同じ項目（本指名/場内/県内/県外/ランク別）も
-- 層デフォルトで持てるようにする。
alter table public.cast_tier_targets
  add column if not exists target_honshimei integer default 0,
  add column if not exists target_banai integer default 0,
  add column if not exists target_local_customers integer default 0,
  add column if not exists target_remote_customers integer default 0,
  add column if not exists rank_targets jsonb default null;

-- ───────────────────────────────────────────────────────
-- ④ 確認用クエリ（コメント解除して実行）
-- ───────────────────────────────────────────────────────
-- select scope_type, scope_id, monthly_s_threshold from public.rank_criteria;
-- select cast_id, month, target_sales from public.cast_targets order by month;
