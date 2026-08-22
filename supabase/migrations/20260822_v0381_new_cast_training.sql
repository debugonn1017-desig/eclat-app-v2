-- v0.3.81: 新人層キャストの90日育成ナビ
-- 入店日だけを永続化し、現在STEPはアプリ側でJSTの今日から自動計算する。
-- キャスト層・KPI・ランク判定には一切干渉しない。

alter table public.profiles
  add column if not exists training_start_date date;

comment on column public.profiles.training_start_date is
  '新人層の90日育成を計算する基準日（実際の入店日）。アカウント作成日とは別管理。';
