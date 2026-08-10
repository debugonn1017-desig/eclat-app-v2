-- v0.3.78: 追いかけリストにキャストが設定する優先度を追加する。
-- 既存行と新規行は「中」を初期値とし、期限・通知・ランク判定には影響させない。

alter table public.customer_follow_ups
  add column if not exists follow_up_priority text not null default '中';

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_follow_up_priority_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_follow_up_priority_check
  check (follow_up_priority in ('最優先', '高', '中', '低'));

comment on column public.customer_follow_ups.follow_up_priority is
  'キャストが手動設定する追いかけ優先度。最優先・高・中・低の4段階。';
