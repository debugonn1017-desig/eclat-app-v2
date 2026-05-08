-- ═══════════════════════════════════════════════════════════════════
--  権限体系 v5 — 完全再設計
-- ═══════════════════════════════════════════════════════════════════
--
-- 旧 v4: 15 権限（顧客編集 / キャスト管理 / お知らせ管理 等の単純名）
-- 新 v5: 17 権限（カテゴリ.アクション 形式）
--
-- 主な変更点:
--   1. 権限名を「カテゴリ.アクション」フォーマットに統一（例: 顧客.編集）
--   2. 「キャスト管理」の責務を分割：
--       - キャスト.アカウント管理（ID/PASS/退店処理のみ）
--       - キャスト.閲覧（一覧・名前を見る）
--       - KPI.閲覧（売上・達成率を見る）
--   3. キャスト分析 → KPI.詳細分析 に改名（オーナー専用想定だが、譲渡も可能）
--   4. 通知.送信 を新規追加
--   5. ロールプリセットは廃止（個別 ON/OFF のみ）
--
-- 適用: Supabase ダッシュボード → SQL Editor → 全文を貼って Run
-- ═══════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────
-- ① 旧 CHECK 制約を撤去
-- ───────────────────────────────────────────────────────
alter table public.staff_permissions
  drop constraint if exists staff_permissions_permission_check;

-- ───────────────────────────────────────────────────────
-- ② 旧「キャスト管理」を持つスタッフに、新「キャスト.閲覧」と
--    「KPI.閲覧」も付与（旧体系で得られていた可視範囲を維持）
-- ───────────────────────────────────────────────────────
insert into public.staff_permissions (staff_id, permission, enabled)
select sp.staff_id, 'キャスト.閲覧', sp.enabled
from public.staff_permissions sp
where sp.permission = 'キャスト管理'
  and sp.enabled = true
  and not exists (
    select 1 from public.staff_permissions sp2
    where sp2.staff_id = sp.staff_id
      and sp2.permission in ('キャスト.閲覧', 'キャスト閲覧')
  );

insert into public.staff_permissions (staff_id, permission, enabled)
select sp.staff_id, 'KPI.閲覧', sp.enabled
from public.staff_permissions sp
where sp.permission = 'キャスト管理'
  and sp.enabled = true
  and not exists (
    select 1 from public.staff_permissions sp2
    where sp2.staff_id = sp.staff_id
      and sp2.permission = 'KPI.閲覧'
  );

-- ───────────────────────────────────────────────────────
-- ③ 旧名 → 新名（1対1 マッピング）
-- ───────────────────────────────────────────────────────
update public.staff_permissions set permission = '顧客.編集'              where permission = '顧客編集';
update public.staff_permissions set permission = '顧客.閲覧'              where permission = '顧客閲覧';
update public.staff_permissions set permission = '顧客.引継ぎ'            where permission = '顧客引継ぎ';
update public.staff_permissions set permission = 'キャスト.アカウント管理' where permission = 'キャスト管理';
update public.staff_permissions set permission = 'キャスト.閲覧'          where permission = 'キャスト閲覧';
update public.staff_permissions set permission = 'KPI.詳細分析'           where permission = 'キャスト分析';
update public.staff_permissions set permission = 'シフト.管理'            where permission = 'シフト管理';
update public.staff_permissions set permission = 'シフト.閲覧'            where permission = 'シフト閲覧';
update public.staff_permissions set permission = '売上.入力'              where permission = '売上入力';
update public.staff_permissions set permission = '売上.閲覧'              where permission = '売上閲覧';
update public.staff_permissions set permission = 'お知らせ.管理'          where permission = 'お知らせ管理';
update public.staff_permissions set permission = 'お知らせ.投稿'          where permission = 'お知らせ投稿';
update public.staff_permissions set permission = 'お知らせ.閲覧'          where permission = 'お知らせ閲覧';
update public.staff_permissions set permission = 'レポート.閲覧'          where permission = 'レポート閲覧';
update public.staff_permissions set permission = 'レポート.出力'          where permission = 'レポート出力';

-- ───────────────────────────────────────────────────────
-- ④ 重複行があれば削除（同じ staff_id × 同じ permission が
--    旧名 + 新名で並んでた場合のクリーンアップ）
-- ───────────────────────────────────────────────────────
delete from public.staff_permissions a
using public.staff_permissions b
where a.ctid > b.ctid
  and a.staff_id = b.staff_id
  and a.permission = b.permission;

-- ───────────────────────────────────────────────────────
-- ⑤ 新 CHECK 制約（17 権限）
-- ───────────────────────────────────────────────────────
alter table public.staff_permissions
  add constraint staff_permissions_permission_check
  check (permission in (
    -- 顧客系
    '顧客.閲覧',
    '顧客.編集',
    '顧客.引継ぎ',
    -- キャスト系
    'キャスト.閲覧',
    'キャスト.アカウント管理',
    -- KPI系
    'KPI.閲覧',
    'KPI.詳細分析',
    -- シフト系
    'シフト.閲覧',
    'シフト.管理',
    -- 売上系
    '売上.閲覧',
    '売上.入力',
    -- お知らせ系
    'お知らせ.閲覧',
    'お知らせ.投稿',
    'お知らせ.管理',
    -- レポート系
    'レポート.閲覧',
    'レポート.出力',
    -- 通知系（新規）
    '通知.送信'
  ));

-- ───────────────────────────────────────────────────────
-- ⑥ 確認用クエリ（コメント解除して実行）
-- ───────────────────────────────────────────────────────
-- select permission, count(*) from public.staff_permissions
-- group by permission order by permission;
