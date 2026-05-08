-- お知らせに「誰が投稿したか」を記録するため created_by 列を追加
-- 適用: Supabase ダッシュボード → SQL Editor で実行

alter table public.announcements
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

-- 既存データは null のままでOK（不明扱い）
-- 以降の insert は created_by を自動セット（アプリ側で渡す）

create index if not exists announcements_created_by_idx on public.announcements(created_by);
