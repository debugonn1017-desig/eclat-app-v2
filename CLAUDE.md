@AGENTS.md

# Éclat アプリ — プロジェクトガイド

キャバクラ/ラウンジ向け顧客管理・キャスト管理アプリ。

## 技術スタック

- Next.js 16.2.3 (App Router) + React 19 + TypeScript
- Supabase (認証 + DB + RLS)
- Vercel デプロイ
- カラーパレット: `lib/colors.ts` の `C` オブジェクトを必ず使用

## ルート構造

```
app/
├── login/              # ログインページ
├── new/                # 新規顧客登録
├── customer/[id]/      # 顧客詳細（キャスト用）
├── casts/[id]/         # キャスト詳細（KPI/売上/シフト/顧客/設定タブ）
├── admin/
│   ├── casts/          # 管理者メイン（キャスト/顧客/お知らせ管理）
│   ├── daily-sales/    # 日次売上一括入力
│   ├── shifts/         # シフト一括管理（ペイント&ドラッグ方式）
│   └── performance/    # キャスト成績一覧（ランキング+オーバーレイ）
├── api/                # APIルート（auth/me, admin/*, customers/*)
└── auth/               # Supabase認証コールバック
```

## 主要コンポーネント

| ファイル | 用途 |
|---------|------|
| `CastKPITab.tsx` | キャストKPI表示（売上グラフ、ランク別、転換トラッキング） |
| `CustomerDetailPanel.tsx` | 顧客詳細パネル（来店履歴、メモ、連絡先） |
| `CustomerForm.tsx` | 顧客登録/編集フォーム |
| `CastSettingTab.tsx` | キャスト設定タブ |
| `BottomNav.tsx` | モバイルボトムナビ |
| `AnnouncementBanner.tsx` | お知らせバナー |
| `BirthdayReminder.tsx` | 誕生日リマインダー |

## 主要フック

| ファイル | 用途 |
|---------|------|
| `useCasts.ts` | キャスト一覧、KPI取得、シフト管理、目標管理、転換詳細 |
| `useCustomers.ts` | 顧客CRUD、来店記録、連絡先、メモ |
| `useViewMode.ts` | PC/モバイル判定（768px）、`isPC` と `toggle` を返す |

## データモデル（主要テーブル）

- `profiles` — ユーザー（role: 'owner' | 'admin' | 'cast'）
- `customers` — 顧客（cast_name, nomination_status, customer_rank, region）
- `customer_visits` — 来店記録（amount_spent, has_douhan, has_after, table_number）
- `cast_shifts` — シフト（status: '出勤' | '休み' | '希望出勤' | '希望休み' | '来客出勤' | '未定'）
- `cast_targets` — 個人目標（月次）
- `cast_tier_targets` — 層別ベースノルマ
- `nomination_history` — 指名転換履歴（場内→本指名）
- `announcements` — お知らせ
- `staff_permissions` — スタッフ権限

## 権限システム

- Owner: 全権限
- Admin/Staff: `staff_permissions` テーブルで権限管理
- 権限例: '売上入力', 'シフト管理', 'レポート閲覧', 'お知らせ管理', '顧客引継ぎ'
- 管理ページで `hasPerm('権限名')` で判定

## キャスト層

`CAST_TIERS = ['A層', 'B層', '新人層', '無類', 'C層']`
層ごとにグループ表示する箇所あり（シフト管理、日次売上）

## 開発ルール

- スタイルは全て inline style（Tailwind不使用、`C` カラー定数を使用）
- `useViewMode()` でPC/モバイル分岐
- Supabase RLS が有効 — サーバーサイドは service_role キー使用
- キャッシュ: `lib/cache.ts` の `getCache/setCache` を使用
- 型定義: `types/index.ts` に集約
