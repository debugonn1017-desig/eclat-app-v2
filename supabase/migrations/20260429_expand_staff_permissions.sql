-- staff_permissionsのpermission制約を更新
-- 既存5種に「売上入力」「シフト管理」を追加して7種に拡張
ALTER TABLE staff_permissions DROP CONSTRAINT IF EXISTS staff_permissions_permission_check;
ALTER TABLE staff_permissions ADD CONSTRAINT staff_permissions_permission_check
  CHECK (permission IN ('顧客編集', 'キャスト管理', 'お知らせ管理', 'レポート閲覧', '顧客引継ぎ', '売上入力', 'シフト管理'));
