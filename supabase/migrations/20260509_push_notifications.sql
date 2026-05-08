-- Web Push 通知 — 購読登録 + 送信履歴 の2テーブル
-- 適用: Supabase ダッシュボード → SQL Editor で実行

-- ============================================
-- 1) push_subscriptions: ユーザーごとの購読情報
-- ============================================
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- 同じデバイス/ブラウザは endpoint で一意
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id);

-- RLS: 自分の購読のみ読み書き可能、admin/owner は全部読める
alter table push_subscriptions enable row level security;

drop policy if exists "self_read" on push_subscriptions;
create policy "self_read" on push_subscriptions
  for select using (
    auth.uid() = user_id
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "self_insert" on push_subscriptions;
create policy "self_insert" on push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "self_delete" on push_subscriptions;
create policy "self_delete" on push_subscriptions
  for delete using (auth.uid() = user_id);

-- ============================================
-- 2) push_notifications: 送信履歴（管理者送信のログ）
-- ============================================
create table if not exists push_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  url text,                              -- クリック時の遷移先
  target_type text not null,             -- 'all' | 'cast_all' | 'staff_all' | 'tier' | 'individual' | 'auto'
  target_tier text,                      -- target_type='tier' の場合
  target_user_ids uuid[],                -- target_type='individual' の場合
  sent_by uuid references profiles(id) on delete set null,  -- nullable: 自動送信(cron) は null
  sent_at timestamptz not null default now(),
  delivered_count int not null default 0,
  failed_count int not null default 0,
  is_auto boolean not null default false -- 自動送信(朝一サマリ等) フラグ
);

create index if not exists push_notifications_sent_at_idx on push_notifications(sent_at desc);

-- RLS: admin/owner のみ操作可能（履歴も閲覧）
alter table push_notifications enable row level security;

drop policy if exists "admin_only" on push_notifications;
create policy "admin_only" on push_notifications
  for all using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  ) with check (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );
