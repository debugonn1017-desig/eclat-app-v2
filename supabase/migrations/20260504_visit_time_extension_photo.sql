-- 来店時間 / 延長分 / プロフィール画像 のカラム追加
-- ⑤ 時間帯ヒートマップ・⑨ シフト最適化提案・⑪ 写真ギャラリー の前提

-- ─── customer_visits に来店時間と延長分 ─────────────────
alter table customer_visits
  add column if not exists visit_time time,
  add column if not exists extension_minutes integer default 0;

comment on column customer_visits.visit_time is '来店時刻（時間帯ヒートマップ・シフト最適化用）';
comment on column customer_visits.extension_minutes is '延長分数（30分単位想定、合計売上には影響しない補助情報）';

-- ─── cast_extension_sales に開始時刻と延長分 ────────────
alter table cast_extension_sales
  add column if not exists start_time time,
  add column if not exists extension_minutes integer default 0;

comment on column cast_extension_sales.start_time is '場内延長の開始時刻';
comment on column cast_extension_sales.extension_minutes is '延長分数（補助情報）';

-- ─── customers にプロフィール写真 URL ──────────────────
alter table customers
  add column if not exists photo_url text;

comment on column customers.photo_url is 'プロフィール写真 URL（Supabase Storage の customer-photos バケット）';
