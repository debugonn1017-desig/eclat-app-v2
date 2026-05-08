-- スタッフ権限の細分化 (v4)
--   v3 で 14 権限まで拡張済み。
--   v4 では「キャスト分析」を追加し、計 15 権限に。
--
--   追加する権限:
--     - キャスト分析 ... /admin/casts/[id] のキャスト個別 詳細分析ページを閲覧する権限
--                       売上推移、客層変化、異変検知、過去全データ など
--                       オーナー以外は付与制（デフォルト無効）

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
    -- v2
    'キャスト閲覧',
    'お知らせ閲覧',
    'お知らせ投稿',
    'レポート出力',
    -- v3
    'シフト閲覧',
    '売上閲覧',
    '顧客閲覧',
    -- v4 (今回追加)
    'キャスト分析'
  ));

SELECT 'staff_permissions v4 constraint' AS item,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_permissions_permission_check'
  ) THEN 'OK' ELSE 'MISSING' END AS status;
