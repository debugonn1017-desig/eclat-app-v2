-- v0.3.83: 黒服専用のキャストMTログ（追記専用）

create table if not exists public.cast_meeting_logs (
  id uuid primary key default gen_random_uuid(),
  cast_id uuid not null references public.profiles(id) on delete restrict,
  meeting_date date not null,
  title text not null,
  staff_name text not null,
  transcript text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint cast_meeting_logs_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint cast_meeting_logs_staff_name_check
    check (char_length(btrim(staff_name)) between 1 and 80),
  constraint cast_meeting_logs_transcript_check
    check (char_length(btrim(transcript)) between 1 and 100000),
  constraint cast_meeting_logs_created_by_name_check
    check (char_length(btrim(created_by_name)) between 1 and 120)
);

create index if not exists cast_meeting_logs_cast_timeline_idx
  on public.cast_meeting_logs (cast_id, meeting_date desc, created_at desc);

alter table public.cast_meeting_logs enable row level security;

drop policy if exists cast_meeting_logs_admin_select on public.cast_meeting_logs;
create policy cast_meeting_logs_admin_select
  on public.cast_meeting_logs
  for select
  to authenticated
  using (public.current_role() = 'admin');

drop policy if exists cast_meeting_logs_admin_insert on public.cast_meeting_logs;
create policy cast_meeting_logs_admin_insert
  on public.cast_meeting_logs
  for insert
  to authenticated
  with check (
    public.current_role() = 'admin'
    and created_by = auth.uid()
    and exists (
      select 1
      from public.profiles target
      where target.id = cast_id
        and target.role = 'cast'
    )
  );

revoke all on table public.cast_meeting_logs from public, anon;
revoke all on table public.cast_meeting_logs from authenticated;
grant select, insert on table public.cast_meeting_logs to authenticated;

comment on table public.cast_meeting_logs is
  '黒服専用のキャストMT記録。キャスト本人はRLSで閲覧不可。追記専用で編集・削除不可。';
comment on column public.cast_meeting_logs.staff_name is
  'MTを担当したスタッフ名（入力値）';
comment on column public.cast_meeting_logs.created_by_name is
  '登録操作を行ったログインアカウントの表示名スナップショット';
