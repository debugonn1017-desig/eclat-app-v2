-- v0.3.63: 追いかけリストを「再来店期限・複数の行動・営業連絡間隔」で管理する。
--
-- 旧 next_contact_date / next_action は、適用済みデータと旧アプリの切り戻し互換のため
-- 削除しない。新UI・新APIは以下の追加列だけを使用する。

alter table public.customer_follow_ups
  add column if not exists return_visit_deadline date,
  add column if not exists return_visit_deadline_preset text,
  add column if not exists next_actions text[] not null default '{}'::text[],
  add column if not exists sales_contact_interval_days smallint;

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_return_visit_deadline_preset_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_return_visit_deadline_preset_check
  check (
    return_visit_deadline_preset is null
    or return_visit_deadline_preset in (
      'tomorrow',
      'within_3_days',
      'within_1_week',
      'within_2_weeks',
      'within_1_month',
      'within_2_months',
      'within_3_months',
      'within_6_months'
    )
  );

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_return_visit_deadline_pair_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_return_visit_deadline_pair_check
  check (
    (return_visit_deadline_preset is null and return_visit_deadline is null)
    or
    (return_visit_deadline_preset is not null and return_visit_deadline is not null)
  );

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_next_actions_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_next_actions_check
  check (
    next_actions <@ array[
      '営業連絡',
      '関係値づくり',
      '来店斡旋',
      '同伴斡旋',
      'アフター斡旋',
      'プライベートで関係値づくり'
    ]::text[]
  );

alter table public.customer_follow_ups
  drop constraint if exists customer_follow_ups_sales_contact_interval_days_check;

alter table public.customer_follow_ups
  add constraint customer_follow_ups_sales_contact_interval_days_check
  check (
    sales_contact_interval_days is null
    or sales_contact_interval_days in (1, 2, 3, 7, 14, 30)
  );

create index if not exists customer_follow_ups_return_deadline_active_idx
  on public.customer_follow_ups(cast_id, return_visit_deadline)
  where is_active = true;

comment on column public.customer_follow_ups.return_visit_deadline is
  '選択した再来店期限プリセットから、設定時のJST日付を基準に計算した期限日。';
comment on column public.customer_follow_ups.return_visit_deadline_preset is
  '再来店期限の選択肢。期限日を再計算せず、選択内容の表示にも使用する。';
comment on column public.customer_follow_ups.next_actions is
  '次に行う営業・関係づくりの複数選択。自動実行はしない。';
comment on column public.customer_follow_ups.sales_contact_interval_days is
  '営業連絡を空けない日数。「連絡した」の記録日から次の期限を再計算する。';
