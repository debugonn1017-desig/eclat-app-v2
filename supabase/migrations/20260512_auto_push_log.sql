-- ═══════════════════════════════════════════════════════════════════
--  ノルマ達成自動 Push のためのテーブル 2 つ
-- ═══════════════════════════════════════════════════════════════════
--
--  1. auto_push_log    : 重複防止用ログ (cast_id, type, month) ユニーク
--  2. app_settings     : 全体オン/オフ等のキーバリュー設定
--
--  方針:
--    - 一旦オフ (app_settings.auto_push_enabled='false') で導入
--    - オーナーが /admin/notifications で ON にしたら配信開始
--    - 達成タイプ: sales / kokyaku / kengai / banai / workdays
--
--  適用: Supabase ダッシュボード → SQL Editor → 全文貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────
-- ① auto_push_log: ノルマ達成 Push の送信ログ（重複防止用）
-- ───────────────────────────────────────────────────────
create table if not exists public.auto_push_log (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.profiles(id) on delete cascade,
  achievement_type text not null check (achievement_type in (
    'sales', 'kokyaku', 'kengai', 'banai', 'workdays'
  )),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  target_value numeric not null,
  actual_value numeric not null,
  sent_at timestamptz not null default now(),
  -- 同じ cast × type × month は 1 回だけ
  unique (cast_id, achievement_type, month)
);

create index if not exists auto_push_log_cast_month_idx
  on public.auto_push_log(cast_id, month);

-- RLS: オーナーとキャスト本人だけ閲覧可能
alter table public.auto_push_log enable row level security;

drop policy if exists "auto_push_log_select_owner_or_self" on public.auto_push_log;
create policy "auto_push_log_select_owner_or_self"
  on public.auto_push_log for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_owner = true)
    or cast_id = auth.uid()
  );

-- INSERT/UPDATE/DELETE はサーバーサイドのみ (service_role)。
-- service_role は RLS をバイパスするので、policy を作らないだけで実現できる。

-- ───────────────────────────────────────────────────────
-- ② app_settings: アプリ全体のキーバリュー設定
--    既に同名テーブルが存在する場合は重複作成しない
-- ───────────────────────────────────────────────────────
create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

-- 読み取り: 全ログインユーザー OK（オン/オフ状態を見るため）
drop policy if exists "app_settings_select_all_authenticated" on public.app_settings;
create policy "app_settings_select_all_authenticated"
  on public.app_settings for select
  to authenticated
  using (true);

-- 書き込み: 「通知.自動配信設定」権限を持つ admin / オーナーのみ。
-- ただし RLS で permission 名を判定するのは複雑なので、書き込みは
-- サーバー側（service_role）で行い、その中で requirePermission する。

-- 初期値: 自動配信は最初 OFF（オーナーが手動で ON にする）
insert into public.app_settings (key, value)
values ('auto_push_enabled', 'false')
on conflict (key) do nothing;

-- 各達成タイプの個別オン/オフ（将来拡張用、デフォルトは全部 ON）
insert into public.app_settings (key, value) values
  ('auto_push_type_sales', 'true'),
  ('auto_push_type_kokyaku', 'true'),
  ('auto_push_type_kengai', 'true'),
  ('auto_push_type_banai', 'true'),
  ('auto_push_type_workdays', 'true')
on conflict (key) do nothing;
