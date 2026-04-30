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
│   └── performance/    # キャスト成績一覧（横長カード+オーバーレイ）
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

## デザインルール

- 角丸: カード=12px、ボタン=8px、ピルボタン=20px
- ソートタブはピル型ボタン（border-radius: 20px）、選択時はピンク背景（#FBEAF0）
- ランクバッジ: 1位=ゴールドグラデ、2位=シルバー、3位=ブロンズ、それ以外=#F5F0F2
- 層ピル: A層=ピンク、B層=ブルー、新人層=グリーン、無類=アンバー、C層=グレー
- ホバー時にborder-colorを#ED93B1に変更
- 非稼働キャスト（売上0・来店0）はopacity: 0.4
- ミニ指標セル: 背景#F9F6F7、border-radius: 8px
- PC成績一覧: 横長1列カード（上段: 名前/売上/達成率、下段: 指標10個横並び）
- モバイル成績一覧: コンパクトカード（指標5個）
- 一覧からキャスト詳細はオーバーレイモーダルで表示（ページ遷移なし）

## 開発ルール

- スタイルは全て inline style（Tailwind不使用、`C` カラー定数を使用）
- `useViewMode()` でPC/モバイル分岐
- Supabase RLS が有効 — サーバーサイドは service_role キー使用
- キャッシュ: `lib/cache.ts` の `getCache/setCache` を使用
- 型定義: `types/index.ts` に集約

## 直近の進捗（2026-04-28）

### 4/28 後半: エクセル出力 & 営業リスト機能を一気に追加
1. **ExcelJS を導入** (`exceljs` パッケージ) — クライアント側で `.xlsx` を生成しダウンロード
2. **`lib/excelExport.ts`** に Excel 生成ユーティリティを集約
   - `exportCastAllCustomers` — キャストの担当顧客全員の履歴を出力（顧客サマリー + 来店履歴詳細の 2 シート、顧客の切れ目で小計、最終来店日からの日数で色分け 30/60/90 日）
   - `exportSingleCustomer` — 単独顧客の履歴を 1 シートで出力（上部にサマリーカード、下部に来店履歴）
   - `exportSalesList` — 営業リスト出力（フィルター条件をタイトル行にマージセル表示）
3. **機能 A-1: キャスト詳細ページにエクセル出力ボタン**
   - ヘッダー下に「全顧客履歴を出力」「営業リスト出力」の 2 ボタンを追加
4. **機能 A-2: 顧客詳細パネルに「EXCEL」ボタン**
   - EDIT/DEL の隣に追加。クリックでその顧客 1 名分の `.xlsx` ダウンロード
5. **機能 B: `SalesListExportModal` を新規作成** (`components/SalesListExportModal.tsx`)
   - プリセット 8 種: 今月誕生日 / 来月誕生日 / 90日以上未来店 / 60日以上未来店 / VIP（Sランク）/ Aランク以上 / 同伴経験あり / 累計50万円以上
   - 詳細フィルター: 誕生月 / ランク / 最終来店からの日数 / 累計売上 / フェーズ / 地域
   - 該当顧客リストはチェックボックスで個別除外可。選択中の合計売上もリアルタイム表示
   - ボタン押下で `.xlsx` ダウンロード（タイトル行にフィルター条件を埋め込み）
6. **機能 C: `SalesAlertBanner` を新規作成** (`components/SalesAlertBanner.tsx`)
   - ホーム画面（PC・Mobile 両方）に表示
   - 「今月誕生日 N 名」「来月誕生日 N 名」「60日以上未来店 N 名」「90日以上未来店 N 名」を自動でカウント
   - タップでモーダルを該当プリセット付きで開く
7. **`useCustomers` に補助関数を追加**
   - `getBulkVisits(customerIds)` — 複数顧客の来店履歴を一括取得
   - `getLatestVisitDates()` — バナー用、顧客別の最終来店日マップを取得

### 4/28 前半: シフト・日次売上・成績一覧
1. シフト一括管理をペイント&ドラッグ方式に改善（クリック式→ブラシ選択+ドラッグ塗り）
2. シフト管理にUndo/Redo機能追加（スナップショットパターン、最大50件、Ctrl+Z/Ctrl+Shift+Z）
3. 日次売上の出勤チェックボックス修正（希望出勤・来客出勤もチェックONに反映）
4. 日次売上に独立した「出勤確認をシフトに保存」ボタン追加
5. 指名転換トラッキング機能（場内→本指名）をキャストKPIに追加
   - nomination_historyテーブルで履歴管理
   - 転換数・転換率・平均転換日数・履歴リストを表示
   - 月をまたぐ転換にも対応
6. キャスト成績一覧ページ（/admin/performance）を新規作成
   - PC: 横長1列カード（順位/名前/層 | 売上/前月比 | 達成率バー | 指標10個）
   - モバイル: コンパクトカード（指標5個）
   - ソート: 売上/客単価/指名数/転換数/同伴数/前月比
   - CSV出力対応
   - キャストクリックでオーバーレイモーダルにKPI詳細表示
7. 管理タブに「キャスト成績一覧」ボタン追加（レポート閲覧権限で制御）

### DB変更（Supabaseで実行済み）
- `customer_visits` に `table_number TEXT` カラム追加
- `cast_shifts` の status に `来客出勤` を追加

### エクセル出力の使い方メモ
- キャスト詳細ページ: ヘッダーの「全顧客履歴を出力」→ 担当顧客全員の `.xlsx` がダウンロード
- 顧客詳細パネル: 「EXCEL」ボタン → その顧客 1 名分の `.xlsx`
- ホーム画面のアラートバナー: タップでモーダル → 条件で絞ってエクセル出力
- ファイル名は自動生成（例: `田中花子_顧客履歴_2026-04-28.xlsx`、`今月誕生日_営業リスト_2026-04-28.xlsx`）

## 直近の進捗（2026-04-30）

### 4/30: 権限制限 & 成績ランキング & PC版レイアウト改善
1. **DB権限スキーマ修正** — `staff_permissions` の CHECK 制約を5種→7種に拡張（'売上入力', 'シフト管理' を追加）。マイグレーション `20260429_expand_staff_permissions.sql` をSupabaseで実行済み
2. **キャストの入力制限を実装**
   - シフト入力: キャストは閲覧のみ（`isAdmin` チェックで制御）
   - 来店記録: 編集/削除ボタンを `{isAdmin && ...}` でラップ（キャストには非表示）
   - ボトル管理: 編集/削除/新規追加を `{isAdmin && ...}` でラップ
   - `isAdmin` 判定に `owner` ロールも含めるよう修正（`role === 'admin' || role === 'owner'`）
   - `app/page.tsx`, `app/customer/[id]/page.tsx` にロール判定を追加
3. **成績ランキングをキャストページに移動**
   - `components/CastRankingTab.tsx` を新規作成（パフォーマンスページのロジックを再利用可能コンポーネントに）
   - キャスト詳細ページに「RANKING」タブを追加（全キャスト閲覧可能）
   - CSV出力は管理者のみ表示
4. **PC版顧客一覧をバナー折りたたみ式に変更**
   - 「ALERTS / お知らせ」セクション: デフォルト閉→クリックで展開（バナー・誕生日・営業アラート）
   - 「SEARCH & FILTER」セクション: デフォルト開→クリックで閉じ可能
   - 両方閉じると顧客リストが画面いっぱいに広がる

### 主要ファイル変更
- `components/CastRankingTab.tsx` — 新規（成績ランキング共通コンポーネント）
- `components/CustomerDetailPanel.tsx` — `isAdmin` propで入力制限
- `app/casts/[id]/page.tsx` — RANKINGタブ追加、isAdmin判定にowner追加
- `app/page.tsx` — ロール判定追加、PC版折りたたみ式バナー
- `app/customer/[id]/page.tsx` — ロール判定追加
- `supabase/migrations/20260429_expand_staff_permissions.sql` — 権限拡張SQL

### キャストの権限まとめ（確定）
- **できること**: 顧客の新規登録・編集、来店予定の作成、KPI閲覧、成績ランキング閲覧
- **できないこと**: シフト入力、来店記録の入力/編集/削除、ボトルの追加/編集/削除
- **閲覧のみ**: シフト、来店履歴、ボトル情報

## 次のタスク

- 月次レポートの自動生成（PDF出力含む）
- ダッシュボードのホーム画面（今日の出勤キャスト・売上速報をまとめ表示）
- 曜日別・時間帯別の売上傾向分析
- 顧客ランク別の来店頻度分析
- キャストごとの顧客単価推移グラフ
- エクセル出力の追加要望（ボトル情報、連絡記録なども入れたい等あれば）
