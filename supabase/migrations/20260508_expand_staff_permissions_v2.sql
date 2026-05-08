-- スタッフ権限の細分化 (v2)
--   既存 7 種を維持しつつ、閲覧/編集の分離が必要な3カテゴリで
--   下位権限（閲覧・出力など）を追加する。
--
--   既存の上位権限（例: 「お知らせ管理」）を持つスタッフは
--   下位権限も自動的に持っているとアプリ側で OR チェックするので、
--   既存スタッフのデータ移行は不要。
--
--   追加する権限:
--     - キャスト閲覧   ... 編集はせず、一覧と KPI のみ閲覧したい人向け
--     - お知らせ閲覧   ... 投稿はせず読むだけ
--     - お知らせ投稿   ... 投稿のみ
--     - レポート出力   ... PDF / CSV のエクスポート権限（閲覧とは別軸）

ALTER TABLE public.staff_permissions
  DROP CONSTRAINT IF EXISTS staff_permissions_permission_check;

ALTER TABLE public.staff_permissions
  ADD CONSTRAINT staff_permissions_permission_check
  CHECK (permission IN (
    -- 既存（互換維持）
    '顧客編集',
    'キャスト管理',
    'お知らせ管理',
    'レポート閲覧',
    '顧客引継ぎ',
    '売上入力',
    'シフト管理',
    -- 追加（細分化）
    'キャスト閲覧',
    'お知らせ閲覧',
    'お知らせ投稿',
    'レポート出力'
  ));

-- 動作確認
SELECT 'staff_permissions check constraint' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_permissions_permission_check'
  ) THEN 'OK' ELSE 'MISSING' END AS status;
