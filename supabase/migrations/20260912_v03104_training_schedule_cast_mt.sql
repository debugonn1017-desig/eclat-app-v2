-- v0.3.104: 教育予定の区分へ「キャストMT」を追加する。
-- 既存4区分と保存済み行は変更せず、category CHECKだけを5区分へ拡張する。

alter table public.cast_training_schedules
  drop constraint if exists cast_training_schedules_category_check;

alter table public.cast_training_schedules
  add constraint cast_training_schedules_category_check
  check (category in ('phase1', 'phase2', 'phase3', 'communication', 'cast_mt'));

comment on table public.cast_training_schedules is
  '黒服・オーナー専用。出勤・来客出勤・希望出勤日のキャスト教育・コミュニケーション・キャストMT予定。';
comment on column public.cast_training_schedules.category is
  'phase1 / phase2 / phase3 / communication / cast_mt';
