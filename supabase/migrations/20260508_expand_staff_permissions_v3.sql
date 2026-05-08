-- スタッフ権限の細分化 (v3)
--   v2 で「お知らせ閲覧/投稿」「キャスト閲覧」「レポート出力」を追加。
--   v3 では残り3カテゴリ（シフト・売上・顧客）にも閲覧/編集の分離を導入する。
--
--   追加する権限:
--     - シフト閲覧   ... シフト管理ページに入って一覧を見るだけ
--     - 売上閲覧     ... 過去の日次売上を見るだけ、入力・編集は不可
--     - 顧客閲覧     ... お客様詳細を見るだけ、新規登録・編集・削除は不可
--
--   既存の上位権限（シフト管理 / 売上入力 / 顧客編集）を持つ人は、
--   アプリ側の包含チェックで自動的に下位の閲覧もできる扱い。

ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_permission_check;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_permission_check
  CHECK (permission IN (
    -- 既存
    '顧客編集',
    'キャスト管理',
    'お知らせ管理',
    'レポート閲覧',
    '顧客引継ぎ',
    '売上入力',
    'シフト管理',
    -- v2 (2026-05-08 朝)
    'キャスト閲覧',
    'お知らせ閲覧',
    'お知らせ投稿',
    'レポート出力',
    -- v3 (今回追加)
    'シフト閲覧',
    '売上閲覧',
    '顧客閲覧'
  ));

-- 動作確認
SELECT 'staff_permissions v3 constraint' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_permissions_permission_check'
  ) THEN 'OK' ELSE 'MISSING' END AS status;
