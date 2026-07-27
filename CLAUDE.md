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
│   ├── casts/          # 管理者メイン（キャスト/顧客/お知らせ管理 + 設定リンク）
│   ├── daily-sales/    # 日次売上一括入力
│   ├── shifts/         # シフト一括管理（ペイント&ドラッグ方式）
│   ├── performance/    # キャスト成績一覧（横長カード+オーバーレイ）
│   ├── rank-criteria/  # 顧客ランク自動判定の基準設定（階層対応、is_owner/ランク基準.設定）
│   ├── targets/        # ノルマ設定（層別/個別恒久 + 月別特例の管理、is_owner/ノルマ.設定）
│   ├── notifications/  # Web Push 通知の手動配信（通知.送信）
│   ├── monthly-report/ # 月次レポート
│   └── cast-analysis/  # キャスト分析（KPI.詳細分析 権限）
├── api/                # APIルート（auth/me, admin/*, customers/*)
└── auth/               # Supabase認証コールバック
```

## 主要コンポーネント

| ファイル | 用途 |
|---------|------|
| `CastKPITab.tsx` | キャストKPI表示（売上グラフ、ランク別、転換トラッキング） |
| `CastRankingTab.tsx` | 全キャストの成績ランキング（PC=横長/モバイル=コンパクト、達成率バー、バッジ、キャスト視点プライバシー対応） |
| `CustomerDetailPanel.tsx` | 顧客詳細パネル（来店履歴、メモ、連絡先） |
| `CustomerForm.tsx` | 顧客登録/編集フォーム |
| `CastSettingTab.tsx` | キャスト個別の月別ノルマ編集タブ（内部で TargetForm を呼ぶ） |
| `TargetForm.tsx` | ノルマ編集の共通フォーム（基本/指名/エリア/ランク別、3箇所で再利用） |
| `RankRecalcModal.tsx` | 顧客ランク自動判定モーダル（本指名顧客一覧 + 推奨ランク + 個別/一括反映） |
| `BottomNav.tsx` | モバイルボトムナビ |
| `AnnouncementBanner.tsx` | お知らせバナー |
| `BirthdayReminder.tsx` | 誕生日リマインダー |

**lib（純粋ロジック）**
- `lib/rankCalculator.ts` — 顧客ランク自動判定 + rank_criteria の階層検索 (`resolveRankCriteria`)
- `lib/targetResolver.ts` — ノルマの階層検索 (`resolveCastTarget`)

## 主要フック

| ファイル | 用途 |
|---------|------|
| `useCasts.ts` | キャスト一覧、KPI取得、シフト管理、目標管理、転換詳細 |
| `useCustomers.ts` | 顧客CRUD、来店記録、連絡先、メモ |
| `useViewMode.ts` | PC/モバイル判定（768px）、`isPC` と `toggle` を返す |

## データモデル（主要テーブル）

- `profiles` — ユーザー（role: 'admin' | 'cast'。owner は admin かつ `is_owner=true`）
- `customers` — 顧客（cast_name, nomination_status, customer_rank, region）
- `customer_visits` — 来店記録（amount_spent, has_douhan, has_after, table_number）
  - ※ `nomination_status` / `cast_name` 列は**存在しない**。これらは `customers` 側を参照すること
- `cast_shifts` — シフト（status: '出勤' | '休み' | '希望出勤' | '希望休み' | '来客出勤' | '未定'）
- `cast_targets` — 個人目標（**month を nullable 化済み**: 月別=特例 / null=個別恒久デフォルト）
- `cast_tier_targets` — 層別ベースノルマ（**month を nullable 化済み**: null=層別恒久デフォルト、honshimei/banai/local/remote/rank_targets カラム追加済み）
- `rank_criteria` — 顧客ランク自動判定の基準（scope_type/scope_id で階層対応: 'default'/'tier'/'cast'）
- `nomination_history` — 指名転換履歴（場内/フリー→本指名）
- `announcements` — お知らせ
- `staff_permissions` — スタッフ権限（**v6: 22権限**、CHECK 制約あり）

## 権限システム（v6: 2026-05-12〜）

- Owner: `is_owner=true` で全権限（チェック不要、必ず通る）
  - DB role は `'admin'` で、追加で `is_owner=true` フラグが立っている
  - `role='owner'` は**存在しない**（v5 ドキュメント表記は誤り）
- Admin/Staff: `staff_permissions` テーブルで個別 ON/OFF 管理
- 権限名は **「カテゴリ.アクション」フォーマット** に統一（**v6: 22 権限**）
  - 顧客系: `顧客.閲覧` / `顧客.編集` / `顧客.引継ぎ` / `顧客.全店分析`（v6追加）
  - キャスト系: `キャスト.閲覧` / `キャスト.アカウント管理`
  - KPI系: `KPI.閲覧` / `KPI.詳細分析`
  - シフト系: `シフト.閲覧` / `シフト.管理`
  - 売上系: `売上.閲覧` / `売上.入力`
  - お知らせ系: `お知らせ.閲覧` / `お知らせ.投稿` / `お知らせ.管理`
  - レポート系: `レポート.閲覧` / `レポート.出力` / `レポート.全店ビュー`（v6追加）
  - 通知系: `通知.送信` / `通知.自動配信設定`（v6追加）
  - 設定系: `ランク基準.設定` / `ノルマ.設定`
- **包含関係** (`PERMISSION_PARENTS` in `lib/auth.ts`、`PERMISSION_INCLUDES` in `types/index.ts`):
  - 例: `お知らせ.管理` を持つと `お知らせ.投稿` と `お知らせ.閲覧` も自動的にtrue
  - 例: `顧客.編集` を持つと `顧客.閲覧` も true
  - v6追加: `顧客.全店分析` / `レポート.全店ビュー` も `顧客.閲覧` / `レポート.閲覧` を含む
- 管理ページで `hasPerm('権限名')` / API で `requirePermission('権限名')` で判定（包含チェック込み）
- ロールプリセットは v5 で廃止（個別 ON/OFF のみ）

## ホットフィックス履歴（v0.3.32〜v0.3.34）

### v0.3.32: 認可漏れ + 集計バグ修正
- A-1: `customer-meta` API の cast 認可ガード（自分の castId のみ）
- A-2: `auto-push/check` API の cast 認可ガード
- A-3: `customer_visits` に存在しない列（`nomination_status`/`cast_name`）参照を撤廃。`customers` 側を Map 化して参照
  - → v0.3.10〜v0.3.18 で何度も再発した「ホーム集計0件問題」の根本原因解消
- B-1: 転換数を `cast-rankings` と統一（場内/フリー→本指名）

### v0.3.33: 認可ガード強化
- A-1 続編: `customer-meta` の admin (owner以外) に `KPI.閲覧` または `顧客.閲覧` 必須化
- A-2 続編: `auto-push/check` の admin (owner以外) に `通知.自動配信設定` 必須化
- P3: `customerNomMap` のキーを `String(id)` で統一（型安全強化）

### v0.3.34: 中優先度バグ + ドキュメント整合性
- B-2: `RankRecalcModal` の useEffect 依存配列に `castTier` 追加
- B-3: V2 計算へ `customer_rank` を渡して「切れた」防御を二重化
- B-4: `rankCalculatorV2` の `recentTrendRatio` に V1 同様の Infinity 扱い追加
- E-1/E-2/E-3: CLAUDE.md / PERMISSION_PARENTS / owner role 表現を v6 に同期

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
- **状態色は `C.success / warning / caution / danger` 系トークンを使う**（野良 hex 禁止。v0.3.50-B〜。トースト塗り背景は `*Deep`、淡背景は `*Bg`）
- **ラベル（英字見出し・装飾）は小さくて可。読む情報は 10px 以上 + `C.dark`/`C.dark2`**（v0.3.50-B〜）

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
> 歴史記述：現行の owner は `role='admin'` + `is_owner=true`。`role='owner'` は存在しない。
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

## 直近の進捗（2026-05-09）

### 5/9: 権限体系 v5 — 完全再設計（15権限 → 17権限）
> ⚠ 歴史記述：v6 で 22 権限に拡張済み。現行仕様は冒頭の「権限システム（v6）」セクション参照
旧 v2/v3/v4 で増築を重ねてきた結果、権限名が「キャスト管理」「お知らせ管理」「キャスト分析」のように混在し、責務が混ざっていたのを **「カテゴリ.アクション」フォーマット** に統一して根元から整理。

1. **DB マイグレーション** — `supabase/migrations/20260509_permissions_v5_redesign.sql`
   - 旧 CHECK 制約を撤去 → 旧名を新名にリネーム → 新 CHECK 制約を再付与
   - 旧「キャスト管理」を持つスタッフには新「キャスト.閲覧」と「KPI.閲覧」を自動付与（旧体系で得られていた可視範囲を維持）
   - 旧名 `キャスト分析` → 新名 `KPI.詳細分析`
   - 新規追加: `通知.送信`（Web Push 送信用）
2. **責務の分離** — 旧「キャスト管理」を3つに分割:
   - `キャスト.アカウント管理` — ID/PASS/退店処理のみ
   - `キャスト.閲覧` — 一覧・名前を見る
   - `KPI.閲覧` — 売上・達成率を見る
3. **API 側** — `requirePermission()` / `requireAnyPermission()` / `checkPermission()` を新権限名に全置換
   - `/api/push/send` を `通知.送信` 権限ゲートに昇格（従来は `role==='admin'` チェックのみ）
4. **フロント側** — `hasPerm()` / `permissions?.[...]` を新権限名に全置換（13ファイル）
5. **ロールプリセット廃止** — `ROLE_PRESETS` / `RolePresetKey` / `handleApplyPreset` を完全削除（個別 ON/OFF のみ）
6. **包含関係** — `lib/auth.ts` の `PERMISSION_PARENTS` と `types/index.ts` の `PERMISSION_INCLUDES` を新名で再定義

### 17 権限の最終形（カテゴリ別）
> ⚠ 歴史記述：v6 で 22 権限に拡張済み（顧客.全店分析・レポート.全店ビュー・通知.自動配信設定の3つ追加）
- 顧客系: `顧客.閲覧` / `顧客.編集` / `顧客.引継ぎ`
- キャスト系: `キャスト.閲覧` / `キャスト.アカウント管理`
- KPI系: `KPI.閲覧` / `KPI.詳細分析`
- シフト系: `シフト.閲覧` / `シフト.管理`
- 売上系: `売上.閲覧` / `売上.入力`
- お知らせ系: `お知らせ.閲覧` / `お知らせ.投稿` / `お知らせ.管理`
- レポート系: `レポート.閲覧` / `レポート.出力`
- 通知系: `通知.送信`（新規）

### 検証
- DB マイグレーション本番実行済み（Supabase）
- verification クエリで 16 行（`通知.送信` だけ未付与なので OK）すべてドット形式新名と確認
- 本番デプロイ済み（Vercel）、スタッフ管理画面で 17 権限が新名で表示されることを確認

## 直近の進捗（2026-05-09 後半 〜 2026-05-10）

### 5/9 後半: 顧客ランク自動判定機能（キャスト分析の中核）★★★

**コンセプト**: キャストの感覚ではなく「事実（数字）」から本指名顧客の S/A/B/C ランクを自動判定する機能。
キャスト育成のための主軸機能で、キャストへのモチベ装置として、また感覚と現実のズレを矯正する目的で実装。

**判定に使える9項目**（各 ON/OFF 切替可能）:
1. 月次売上ランク（直近 N ヶ月の月平均、しきい値 S/A/B 設定）
2. 累計売上ランク（しきい値 S/A/B 設定）
3. 月次 × 累計の合算方針（高い方/低い方/月次優先）
4. 来店頻度ボーナス（月平均何回以上で +1 / 何回未満で -1）
5. 同伴率ボーナス（◯% 以上で +1）
6. 直近トレンドボーナス（直近3ヶ月 vs その前3ヶ月の月平均比、上昇/下降）
7. 客単価ボーナス（1来店◯円以上で +1）
8. 継続月数ボーナス（◯ヶ月以上で +1）
9. アフター率ボーナス（◯% 以上で +1）
10. 非アクティブ判定（◯日来店なし → -1、強制C）
11. 補正の上限（±N 段階まで）

**主要ファイル**:
- DB: `supabase/migrations/20260509_rank_criteria.sql` — `rank_criteria` テーブル新設（オーナーのみ編集可、RLS）
- 計算: `lib/rankCalculator.ts` — `calculateRecommendedRank()` メイン関数
  - 中間メトリクス算出 → ベースランク → 補正項目 → 上限クランプ → 非アクティブ判定の順で適用
  - 全ステップを `RankReason[]` で記録、モーダルで判定理由を表示
- モーダル: `components/RankRecalcModal.tsx`
  - props: `open` / `castId` / `castName` / `castTier` / `onClose` / `onApplied`
  - 本指名顧客一覧 + 現在ランク → 推奨ランク + 判定理由
  - 個別反映 / 一括反映ボタン
- 設定ページ: `app/admin/rank-criteria/page.tsx`（オーナーまたは `ランク基準.設定` 権限）
- 動線: キャスト個別 `/casts/[id]` の CUSTOMERS タブヘッダーに「📊 ランク再評価」ボタン

### 5/9 後半: ノルマの階層化（毎月手入力ゼロを実現）★★★

**コンセプト**: 月初に毎月キャスト全員のノルマを手入力していためんどくささを解消。
階層型のデフォルト設定で「設定したら自動で毎月適用」を実現。

**階層構造（検索順）**:
1. `cast_targets[cast_id=X, month=今月]` — 月別の特例（最優先）
2. `cast_targets[cast_id=X, month=NULL]` — 個別恒久デフォルト
3. `cast_tier_targets[tier=Y, month=今月]` — 層別月別（レガシー）
4. `cast_tier_targets[tier=Y, month=NULL]` — 層別恒久デフォルト
5. なし → 「ノルマ未設定」

**全項目対応** （売上だけでなく全部の目標項目）:
- 設定売上 / 設定出勤日数
- 目標本指名数 / 目標場内数
- 目標 県内（福岡）人数 / 県外人数
- ランク別目標（S/A/B/C 各々の売上 + 来店回数）

**主要ファイル**:
- DB: `supabase/migrations/20260509_rank_targets_hierarchy.sql`
  - `cast_targets.month` を nullable
  - `cast_tier_targets.month` を nullable
  - `cast_tier_targets` に5カラム追加（target_honshimei/banai/local/remote/rank_targets）
  - `rank_criteria` に `scope_type` / `scope_id` 追加（階層化）
- ノルマ階層検索: `lib/targetResolver.ts` — `resolveCastTarget()`
- 共有部品: `components/TargetForm.tsx` — 売上/出勤/指名/エリア/ランク別の編集フォーム
  - props: `initial` / `onSave` / `title` / `saveLabel` / `readOnly`
  - 3箇所で再利用: 個別月別 / 個別恒久 / 層別
- 設定ページ: `app/admin/targets/page.tsx`（オーナーまたは `ノルマ.設定` 権限）
  - scope セレクター（5層 + キャスト dropdown）
  - 月別の特例ノルマ削除UI（個別/月単位/全削除）
- 既存: `components/CastSettingTab.tsx` を TargetForm 使用にリファクタ（月別ノルマ編集）

### 5/9 後半: 新権限2つ追加（19権限）

```
旧 17 権限 + 'ランク基準.設定' + 'ノルマ.設定' = 19 権限
```

新カテゴリ「⚙️ 設定」グループに配置。両方とも `SENSITIVE_PERMISSIONS`。
**現状: 誰にも未付与**（is_owner だけが通る運用）。後から信頼できる人に渡せる設計。

### 5/9 後半: rank_criteria の階層化

ランク判定基準も「全店 / 層別 / 個別キャスト」の3階層で別基準を設定可能に。
- `rank_criteria` テーブルに `scope_type` ('default' | 'tier' | 'cast') / `scope_id` 追加
- ユニーク制約 `(scope_type, coalesce(scope_id, ''))`
- 設定ページに階層セレクター追加、●バッジで「設定済み」を可視化
- 「親階層からコピーして作成」ボタンで継承
- 「この階層の設定を削除」ボタンで親に戻せる
- 計算時 `lib/rankCalculator.ts:resolveRankCriteria(rows, castId, tier)` で階層検索

### 5/10: ランキング・成績一覧の達成率対応 + キャスト視点プライバシー設計 ★★

**1. 達成率の階層検索対応**
- `app/api/cast-rankings/route.ts`: `resolveTarget(cast)` で4階層検索
- `app/admin/performance/page.tsx`: 同じく4階層検索
- これで `/admin/targets` で設定した層別デフォルトがランキング達成率に反映される

**2. キャスト視点でのプライバシー（二重防御）**

| 閲覧者 | 自分の達成率 | 他キャストの達成率 | サマリー4カード |
|---|---|---|---|
| オーナー / スタッフ | ✅ | ✅ | ✅ |
| キャスト | ✅ | ❌ | ❌ |

- **API 側**: `/api/cast-rankings` で profile.role を見て、キャスト閲覧者には自分以外の `targetSales` と `achievementRate` を **0 にマスク** してレスポンス（DevTools で覗いても見えない）
- **UI 側**: `CastRankingTab` に `viewerCastId` prop 追加、`canSeeAchievement(castId)` で表示判定
- **サマリー**: 「店舗月間売上 / 平均達成率 / 総指名転換 / 稼働キャスト」の4カード全体を `isAdmin` 条件で囲い、キャスト視点では完全非表示
- **バッジ**: モバイル版ランキングカードにもバッジ追加（PC版にはあったが mobile では抜けてた）

**主要ファイル変更**:
- `components/CastRankingTab.tsx` — viewerCastId prop / canSeeAchievement / mobile バッジ追加
- `app/casts/[id]/page.tsx` — viewerUserId state + RankingTab に渡す
- `app/api/cast-rankings/route.ts` — 階層検索 + プライバシーマスク

### キャスト個人ページのノルマ取得を階層検索に
`app/casts/[id]/page.tsx` のロード処理:
- `cast_targets` 月別 + `cast_targets` 恒久 + `cast_tier_targets` 月別 + `cast_tier_targets` 恒久 を全部取得
- 優先順で resolvedTarget を確定
- 何も見つからなければ targetSales=0 → CastKPITab 既存の `targetSales > 0 ? 値 : '未設定'` 表示が自動で効く

### DB 適用済みマイグレーション
- `20260509_rank_criteria.sql` — rank_criteria 新設
- `20260509_rank_targets_hierarchy.sql` — 階層化 + 新権限2つ + cast_tier_targets 拡張

## 次のタスク（候補・未実装）

> 注: 元あった「曜日別・時間帯別ヒートマップ」「ホームダッシュボード」「月次レポート PDF」
> 「キャスト分析・相性タブ」「エクセル出力」「来店周期分析」は既に実装済みなので
> 2026-05-10 のクリーンアップで削除した。下は本当に未実装の候補のみ。

### キャスト育成・ランク関連
- **ランクの一括反映に顧客フィルター追加** — 例: 「高ランク (S/A) 客だけ反映」「Cランクだけ昇格候補を反映」
- **オーナー専用 全店ビュー** — 全キャスト × 全本指名顧客のランクズレ一覧、ボトルネック把握用
  - `/admin/rank-overview` を新設する案
  - 「ハナ→田中: C→B 推奨」みたいな差分一覧
  - is_owner ガード（権限と無関係）

### ノルマ・通知連動
- **ノルマ達成キャストへの自動通知** — Web Push 既設なので、月末締めで「今月ノルマ達成🎉」プッシュ
- **ノルマ達成率の警告通知** — 月の中盤で達成ペースが遅いキャストへリマインド

### 既存ヒートマップの拡張案（やるかどうかは要相談）
- キャスト別の曜日 × 時間帯ヒートマップ（誰が金曜の22時に強いか、等）
- 同じヒートマップを「単価」「指名率」軸で見れるトグル

### 現場運用の改善要望（拓馬さんから出てきたら追加）
- ボトル情報のエクセル出力
- 連絡記録のエクセル出力
- キャスト個人ページの「ノルマ未設定」表示の改善（今は targetSales=0 で代替表示してる）

## 進行中タスク（2026-05-08 開始）

優先順位順、順次対応。各タスクは「調査 → A/B案提示で停止 → 承認後に実装 → 検証 → 記録」のサイクルで進める。

### ① 当日場内→当日本指名 リピート転換バグ【完了 2026-05-08】
- **真因**: nomination_history の cast_id が「操作したユーザー」で記録され、担当キャストの集計から漏れていた
- **対応**: POST/PATCH /api/customers で cast_name 逆引きで担当キャストの cast_id を保存
- **拡張**: 転換カウント条件を「場内/フリー → 本指名」に拡張（フリー→本指名 もカウント）
- **データ**: 過去履歴の cast_id 正規化マイグレーション（20260508_fix_nomination_history_cast_id.sql）実行済み
- **方針**: 自動同期は撤回、手動でプロフィール書き換えしたときだけ転換カウント

### ② スタッフ権限の細分化【完了 2026-05-08 → 2026-05-09 v5 で再設計】
> ⚠ 歴史記述：v6 で 22 権限に再々拡張済み（2026-05-12）
- **v2 (2026-05-08)**: キャスト閲覧 / お知らせ閲覧 / お知らせ投稿 / レポート出力 を追加
- **v3 (2026-05-08)**: シフト閲覧 / 売上閲覧 / 顧客閲覧 を追加
- **v5 (2026-05-09)**: ⚠ 全面再設計。詳細は「直近の進捗（2026-05-09）」参照
  - 旧名（キャスト管理 等）→ 新名（キャスト.アカウント管理 等）にリネーム
  - 旧「キャスト管理」を3つに分離: キャスト.アカウント管理 / キャスト.閲覧 / KPI.閲覧
  - キャスト分析 → KPI.詳細分析 に改名
  - 通知.送信 を新規追加（17 権限）
  - ロールプリセットは廃止（個別 ON/OFF のみ）

### ③ 月次レポートの月切替＋全キャストKPIテーブル
- 月切替UI（既存ある可能性）
- 全キャスト1テーブル一覧、行クリックで個別月次レポートへ
- 怪しい: `app/admin/monthly-report/page.tsx`, `app/casts/[id]/monthly-report/page.tsx`, `app/admin/performance/page.tsx`

### ④ 来客予定をシフト画面に表示
- 顧客詳細で打ち込んだ planned_visits を、シフト画面のキャスト×日付セルにバッジ表示
- 怪しい: `app/admin/shifts/page.tsx`, `planned_visits` テーブル

### ⑤ キャスト個別の管理者向け詳細ページ
- 売上推移、指名数、出勤率、リピート率、平均単価、客層変化を時系列＋グラフ
- 前月比 -20% / -40% で警告
- 権限制御は②と連動（`report_view` 権限が必要な想定）
- グラフライブラリ要追加（recharts か chart.js）

### ⑥ 顧客ランク自動判定 + ノルマ階層化【完了 2026-05-09 後半 〜 5-10】
- **キャスト分析の中核機能**: 9項目から事実ベースで本指名顧客のランクを自動判定
- 主要ファイル: `lib/rankCalculator.ts`, `components/RankRecalcModal.tsx`,
  `app/admin/rank-criteria/page.tsx`
- **ノルマ階層化**: 個別月別 / 個別恒久 / 層別月別 / 層別恒久 の4階層
- 主要ファイル: `lib/targetResolver.ts`, `components/TargetForm.tsx`,
  `app/admin/targets/page.tsx`
- **新権限2つ**: ランク基準.設定 / ノルマ.設定（誰にも未付与）
- **キャスト視点プライバシー**: ランキング達成率を API/UI 両方で他者非表示、サマリーカードもキャスト非表示
- 詳細は「直近の進捗（2026-05-09 後半 〜 2026-05-10）」参照

### 進め方ルール
- 提案フェーズで必ず A案/B案 を提示して停止、ユーザー判断待ち
- 既存マイグレーションは改変禁止、新規ファイルとして追加
- 勝手に git commit / push しない
- 各タスク完了時に「次に進んでいいか」確認

## キャスト層の運用ルール（2026-05-14 確定）

### 6区分の定義

| 区分 | 意味 | DB値 |
|---|---|---|
| **A層** | 最上位レギュラー | `A層` |
| **B層** | 中堅レギュラー | `B層` |
| **C層** | 下位レギュラー | `C層` |
| **新人層** | タワー登録枠 | `新人層` |
| **無類** | ランク外特別枠（昼職・育児等で出勤少） | `無類` |
| **その他** | 分類未確定・暫定 | `その他` |

### 「無類」vs「その他」の使い分け

- **無類**：意図的にランク外として運用。昼職・育児・通勤距離など事情あり。**ただしノルマがつくケースもある**ので、コード側で「無類＝強制免除」のロジックは入れない（個別ノルマ設定で対応）
- **その他**：暫定的に未分類。新規登録後、まだ層が決まっていない場合などに使う一時的な区分

### UI 表示

- **無類**：イニシャル円の左下に🌸（白背景＋ピンク枠線）→ 「ランク表の外」感を視覚化
- **その他**：くすみピンク背景＋小さなタグ
- 他層は塗りつぶし円バッジ

### コードからの判定

```typescript
import { CAST_TIERS, CastTier } from '@/types'

// 無類は UI 上で🌸表示するだけ。
// ノルマ免除を強制するロジックは入れない（個別ノルマで運用）
if (profile.cast_tier === '無類') {
  // UI バッジ表示のみ
}
```

### 関連ファイル
- 型定義：`types/index.ts` の `CAST_TIERS`, `CastTier`
- DB制約：`supabase/migrations/20260514_rebrand_redesign.sql`
- UIコンポーネント：`components/ui/Avatar.tsx`
- ノルマロジック：`lib/targetResolver.ts`（既存ロジックを維持。無類でも個別ノルマ可）

## 直近の進捗（2026-07-15）

### v0.3.51: キャスト名（源氏名）変更機能 ★

**背景**: `profiles.cast_name` だけ変えると `customers.cast_name`（担当顧客の紐づけ）が旧名のまま残り、
担当顧客が集計から消える + RLS 不一致でキャスト本人からも見えなくなる。
定期的に発生する運用のため、恒久機能として「確実セット方式」(DB関数・1トランザクション) で実装。

1. **DB**: `supabase/migrations/20260715_admin_rename_cast.sql` — `admin_rename_cast(p_cast_id, p_new_name)` 新設
   - profiles.cast_name 更新 + customers.cast_name 一斉更新を**1トランザクション**で実行（片方失敗なら両方ロールバック）
   - 対象行を `FOR UPDATE` でロック（同時リネームの直列化）
   - 重複名は `profiles_cast_name_unique` の 23505 で全体ロールバック
   - `security definer` + revoke で **service_role のみ実行可**（クライアント直 RPC は遮断）
   - 戻り値: `(old_name, updated_customers)`
2. **API**: `PATCH /api/admin/casts/[id]` — cast_name は payload 直更新をやめ RPC 経由に変更
   - 23505 → 409「その名前は既に別のキャストが使っています」/ CAST_NOT_FOUND → 404
   - 同名への変更は no-op。レスポンスに `renamed_customers`（更新した顧客数）を追加
   - is_active / display_name / cast_tier は従来どおり直接 update
3. **UI**: `/admin/casts` キャスト行に「名前変更」ボタン（`キャスト.アカウント管理` 権限）
   - 開くと担当顧客数を count 取得し「担当顧客 N 名も一緒に更新されます」と表示
   - confirm → PATCH → toast（更新顧客数入り）+ キャッシュ無効化（customers:all / castPage: / castsKPI: / customerDetail:）
   - ⚠ fetchCasts() 再取得はしない（GET /api/admin/casts の max-age=60 で旧名一覧に巻き戻るため）。PATCH レスポンスで state 更新

**注意（スコープ外の既知課題）**: 顧客引継ぎのプルダウンは `display_name || cast_name` を
`customers.cast_name` に書き込むため、display_name ≠ cast_name のキャストで紐づけがズレ得る（未対応）。

### v0.3.51-hotfix: Codex 指摘対応（5件中4件修正、1件許容）

1. **指摘1 (部分成功)**: リネームと is_active/cast_tier の併用は 400 拒否。display_name のみ RPC v2 引数で同一トランザクション更新可。リネーム成功後の追加クエリを全廃し、既知の値から応答を組み立て（「成功したのにエラー表示」の窓を排除）
2. **指摘2 (同時書き込み競合)**: `20260715_admin_rename_cast_v2.sql` — 関数を3引数 (p_display_name 追加) で作り直し。`lock table customers in exclusive mode` でリネーム中の旧名滑り込みを遮断（SELECT は妨げない、ミリ秒で解放）。CAST_NOT_FOUND に SQLSTATE 'P0002'、security definer 撤去、search_path=''
   - **書き戻し対策**: POST /api/customers（常時）+ PATCH /api/customers/[id]（cast_name が変わるときだけ）に担当キャスト名の実在チェック追加。旧名フォームからの保存は 400「担当キャスト「X」が見つかりません」
   - 根本解決 (customers を cast_id FK 化) は次期候補（大工事、キャスト名文字列結合の全面改修とセット）
3. **指摘3 (本人の authCache 5分)**: 許容。名前変更は稀 + 本人がアプリを開き直せば解消、5分で自然回復。根本対応 (cast_id 判定化) は FK 化とセットで次期候補
4. **指摘4 (renameCount 取り違え)**: renameReqRef で古い非同期結果を破棄。取得失敗は「0名」でなく「取得できませんでした」表示
5. **指摘5 (一覧の旧名巻き戻り)**: 変更成功後に `fetch('/api/admin/casts', { cache: 'reload' })` — HTTP キャッシュ自体を新鮮な結果で上書きするので再訪しても巻き戻らない
6. **表示名対応（拓馬さん要望）**: 名前変更パネルで表示名 (display_name) も編集可（空欄=変更しない）。多くの画面は `display_name || cast_name` 表示のため、キャスト名だけ変えると見た目が変わらない

### v0.3.51-hotfix2: Codex 2回目指摘対応（TOCTOU の根本封鎖）

1. **門番トリガー** `20260715_customers_cast_name_guard.sql` — customers の BEFORE INSERT/UPDATE OF cast_name で担当キャスト名の実在を**書き込みと同一トランザクション内**で検証（errcode 23503, message 'CAST_NAME_NOT_FOUND'）。API 事前チェックの TOCTOU 隙間と、引継ぎ等のクライアント直接書き込みのバイパスを両方封鎖
   - 許可: NULL/空文字/空白のみ（担当未定）、退店キャストの名前（ソフトデリート設計）、cast_name 不変の UPDATE
2. **admin_rename_cast v3**（同マイグレーション）— **ロック順ルール: customers テーブルロック → profiles 行ロック**（今後この順を厳守。逆順はデッドロックの温床）+ lock_timeout 3秒。API は 55P03/40P01 → 503「他の処理と競合しました」
3. **顧客 API 正規化**（POST/PATCH）— cast_name が string 以外（null 除く）は 400、trim、空白のみ→''。PATCH は現在値と同じなら payload から削除（書き込み自体を回避）。payload が空になったら現在行を返す。トリガー拒否は 400 の日本語エラーに変換
4. **引継ぎプルダウン修正** — 書き込む値を `display_name || cast_name` → `cast_name` に統一（既知バグの根本修正。トリガー導入で実在しない名前は保存不可になったため必須）
5. **renameCount 連番化** — 同一キャストの閉じて開き直し競合にも対応
6. **表示名のみ変更時の文言** — 「担当顧客の紐づけは変更されません」に出し分け

**⚠ 既知の制約（Codex 助言で訂正）**: キャスト名変更後、本人がログイン中の端末は sessionStorage の authCache（5分 TTL）が旧名を保持する。マウント済み画面は5分経っても自動再取得せず、5分以内のリロードも旧名を再利用する。**「タブを閉じて開き直す or 再ログイン」で解消**、と本人に案内する運用。focus 時 fetchMe 再検証 / プロフィール Realtime 購読は認証系のため別バージョンで慎重に検討（次期候補）

### v0.3.51-hotfix3: Codex 3回目指摘対応（台帳側の門番 + 設計判断の確定）

1. **profiles 側の門番** `20260715_cast_name_guard_v2.sql` — profiles.cast_name の変更を service_role / postgres のみに制限（BEFORE UPDATE トリガー, errcode 42501）。RLS が admin 全員に profiles 直接 UPDATE を許可しているため、ブラウザから cast_name だけ書き換えて正規ルート（admin_rename_cast）を迂回する経路を封鎖。cast_name を変えない UPDATE は従来どおり
2. **customers 門番 v2**（同マイグレーション）— UPDATE OF cast_name 限定 → UPDATE 全体で発火し関数内で変更判定（他トリガーが NEW を書き換えても検知、未変更は先頭で即 return）。cast_name を実際に変更するときだけ btrim 正規化（空白のみ→''。既存データは触らない）
3. **設計判断（2026-07-15 拓馬さん確定）**: **退店キャストへの新規割当・引継ぎは許可のまま**（復帰予定の子への事前紐づけ等の運用があるため）。門番の実在チェックは is_active を見ない。誤選択防止として引継ぎプルダウンに「（退店）」表記を追加
4. **引継ぎプルダウン表記** — 表示名 ≠ キャスト名の子は「表示名（キャスト名）」（表示名重複時の判別）、退店キャストは「（退店）」付き
5. **API 方針の確定**: PATCH /api/customers/[id] で許可フィールドゼロ（未知フィールドのみ）のリクエストは 200 + 現在行を返す扱いを許容（Codex 指摘4。厳密な 400 区別はしない）

### v0.3.51-hotfix3-P1: マイグレーション順の是正（Codex 4回目 P1）

- 20260715_* の4ファイルはファイル名順 ≠ 作成順のため、クリーン環境で順に適用すると customers 門番が hotfix2 の v1 定義に巻き戻る問題があった
- 対応: `20260716_cast_name_guard_final.sql`（新規・forward-only）で最終確定状態（admin_rename_cast v3 / profiles_cast_name_guard / customers_cast_name_guard v2）を再適用。適用済みファイルは不変更
- **マイグレーション命名ルール（今後厳守・Codex 5回目で訂正済み）**: `YYYYMMDDHHMMSS_name.sql` の一意な数値プレフィックスを使う（例: `20260716093000_xxx.sql`, `20260716093100_yyy.sql`）。Supabase CLI はタイムスタンプ部分を一意 ID として扱うため、`20260716_a` / `20260716_b` のような英字連番は CLI 上どちらも version `20260716` となり衝突する。関数・トリガーの定義変更は必ず「並び順で最後になる新ファイル」で行う
- **既知の基盤課題（v0.3.51 シリーズ外・未対応）**: 既存リポジトリには同日付プレフィックスのマイグレーションが複数あり（20260509 ×2、20260715 ×4 等）、`supabase db reset` / `db push` による CLI クリーン再構築では履歴 ID が衝突する。現在の「SQL Editor で手動適用」運用では問題なし。CLI 移行時に migration history の整理（リネーム + 履歴修正）が別途必要
- Codex 確認済み事項の記録: current_user 判定（authenticated 拒否 / service_role・postgres 許可）は Supabase のロール構成に合致。btrim は全角スペースを消さないが安全側（拒否）に倒れる。customers に BEFORE トリガーを追加する場合は門番を最後に実行させる規約が必要。退店キャスト割当許可の残リスク（本人から見えない・is_active 絞り集計の対象外・同名再利用不可・profiles 物理 DELETE の孤児化）は運用でカバー = **キャスト profile は物理削除しない運用を維持**

## 直近の進捗（2026-07-16）

### v0.3.52-A: CUSTOMERS タブ「地域未設定」グループ新設（消える本指名の解消）

**症状**: キャスト詳細 CUSTOMERS タブ・KPI 顧客数に本指名顧客が出ない（はるさんで発覚）。
**原因**: 「本指名 × ランクS/A/B × 地域未設定」はグループ分けで「顧客」（福岡県必須）にも「県外顧客」（地域入力必須）にも該当せず、どのグループにも表示されなかった。店全体で35キャスト・200人超が非表示だった（DB調査 2026-07-16）。
**対応**: `app/casts/[id]/page.tsx` CUSTOMERS タブに受け皿グループ「地域未設定」（C.warning 色）を追加（純追加のみ）。
**設計判断（拓馬さん確定）**:
- KPI「顧客数 = 本指名+福岡+S/A/B」（v0.3.17 定義）は**変更しない**。地域未設定は顧客数に**入れない**（B案）。地域を入力すれば「顧客」/「県外顧客」へ自動で移り、数字にも反映される
- SALES タブの getCategory は従来から「地域空欄 = 県内扱い」で表示される仕様のため変更しない（CUSTOMERS タブとの扱いの違いは意図的）
**運用**: 地域未入力の本指名リストは SQL（nomination_status='本指名' and nullif(btrim(region), '') is null and customer_rank in ('S','A','B')）で出せる。スタッフが順次地域を入力していく（※ region is null だけだと空文字・空白のみの値が漏れる。hotfix で改訂済み）

### v0.3.52-A hotfix: Codex 指摘対応（文言・保存後の自動反映・SALES注記）

1. **P2-1 文言修正**: 「地域未設定」グループのラベルを「地域を入力すると顧客数に反映」→「地域を入力すると正しい区分に反映」（県外入力時は県外顧客へ移るだけで KPI 顧客数は増えないため）
2. **P2-2 保存後の自動反映**: CustomerDetailPanel に任意 prop `onCustomerUpdated` を追加（既存呼び出し8箇所に影響なし）。casts/[id] は保存を customerEditedRef で記憶し、**パネルを閉じたタイミング**で `castPage:` キャッシュを invalidate + refreshKey++ → グループ分け・KPI・SALES が最新化（保存の瞬間に再読み込みするとパネルごと閉じるため閉時実行）
3. **SALES 注記**: 顧客別詳細ビューに「※『顧客』グループには地域未設定の本指名のお客様も含まれます」を表示（CUSTOMERS タブとの人数差の誤認防止）
4. **運用SQLの改訂**: 地域未入力リストは `region is null` でなく `nullif(btrim(region), '') is null` を使う（空白のみ対策・Codex 助言）
5. Codex 確認済みの記録: グループ分類は96パターン機械検証で重複・漏れなし / KPI は過去月も現在の顧客属性で再分類される設計（過去実績の固定要件が出たら別途検討）/ nomination_status に値域CHECKなし（不正文字列は既存の分類漏れとして残る）

### v0.3.53-A: 顧客分類ロジックの共通化 + 仕様固定テスト導入 ★

**背景**: 顧客カテゴリの業務ルールが CUSTOMERS タブ / SALES タブ / KPI (useCasts) / ランキング API に分散重複しており、v0.3.52-A「地域未設定が消える」型の不整合の温床だった。

1. **新規 `lib/customerCategory.ts`** — 分類ロジックの単一情報源
   - `classifyCustomersTab()` — 切れた最優先 → 顧客/県外顧客/地域未設定/ランクC/その他/場内/フリー。不正な指名状況は null (どこにも表示しない = 既存挙動)
   - `classifySalesTab()` — SALES固有差 (地域未設定=顧客扱い / 切れた独立分類なし / 不正値はランク判定へ) を**別関数**で表現 (意図的な非対称)
   - `isKpiKokyaku()` (本指名+福岡+S/A/B = v0.3.17 顧客数定義) / `isKpiKengai()` (本指名+地域あり+福岡以外 = **ランク不問が現行仕様**)
2. **新規 `lib/customerCategory.test.ts`** — 仕様固定テスト (追加パッケージ**ゼロ**: Node 22 内蔵 node:test + 既存 tsc)
   - **旧 inline 実装をオラクルとして意味的に同値な形で転記し、指名6×ランク8×地域5 = 240通り全組み合わせで新旧完全一致を検証** (排他性 = 高々1カテゴリも同時に証明)
   - 固定仕様の明示ケース (切れた最優先 / SALES非対称 / KPI地域未設定除外 / 県外入力で顧客数不変 等)
   - 実行: `npm run test:category` (ネット不要。.test-dist は gitignore 済み)
3. **置換 (挙動不変)**: casts/[id] CUSTOMERS 分類 + SALES getCategory / useCasts.getCastKPI の kokyaku/kengai/月間来店述語 / cast-rankings API の同述語
4. **今回対象外 (Phase 2 候補)**: home-dashboard のリスク客判定 (別目的) / cast-evaluation / excelExport (表示のみ)

**発見した「意図しない差」(挙動維持で固定・是正は別バージョンでオーナー判断)**:
- KPI「県外顧客」(kengaiCount) は**ランク不問** (切れた含む) — CUSTOMERS の「県外顧客」グループ (S/A/B 限定) と定義が異なる
- KPI「rankCCount」は本指名条件なし・切れた除外なし — CUSTOMERS の「ランクC」(本指名×C×非切れた) と定義が異なる
- SALES は本指名以外の不正な指名状況もランク判定に落ちる / CUSTOMERS は不正値を非表示

### v0.3.53-A hotfix: Codex 指摘対応（auto-push 統一 + コメント事実訂正）

1. **P2-1**: `app/api/auto-push/check/route.ts` の月間来店分類 (通知条件) も `isKpiKokyaku`/`isKpiKengai` に統一（共通化の取りこぼし。通知条件と KPI 表示のズレを予防）
2. **P2-2**: テストコメントの事実誤認を訂正 — DB 門番トリガーが btrim 正規化するのは **cast_name のみ**。region は正規化されない
3. **既知課題（新規記録）**: 空白のみの region が入ると「CUSTOMERS/KPI = 県外扱い」「運用SQL = 未設定扱い」の不整合になり得る。挙動変更禁止のため現状維持。是正（region の trim 正規化 or 分類側での btrim 判定）は仕様変更としてオーナー判断
4. オラクルの説明を「逐語的に写し」→「意味的に同値な形で転記（!! 明示化のみ）」に訂正（Codex 確認済み: 対象型では完全同値）

### v0.3.53-B: 品質ゲート整備（CI + 共通スクリプト）

**目的**: v0.3.53-A の仕様固定テストと型チェックを push/PR ごとに必ず実行する品質ゲート化。アプリの動作変更なし。

1. **package.json スクリプト追加**: `typecheck` (tsc --noEmit) / `test` (= test:category) / `check` (typecheck + test) / `lint:category` (共通分類モジュール2ファイルの lint)
2. **`.github/workflows/ci.yml` 新規**: push / pull_request で ubuntu-latest + Node 22 + npm cache + `npm ci` → typecheck / test / lint:category を必須チェック化（既存 keep-warm.yml は不変更）
3. **`npm run build` は CI に含めない（理由）**: lib/supabase/client・server・admin が `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` を必須参照しており環境変数なしで成立しない。ダミー秘密情報はコミットしない方針のため除外。build の検証は従来どおり Vercel デプロイが担う
4. **`npm run lint` (全体) は必須 CI に含めない**: 既存 **144 problems（76 errors / 68 warnings）**（.test-dist 生成物を除外した正しい基準値。Codex 指摘 P2 で訂正）。continue-on-error での見かけ成功はさせない方針
   - 内訳（2026-07-16 時点の上位）: `@typescript-eslint/no-unused-vars` 57 / `@typescript-eslint/no-explicit-any` 47 / `react-hooks/purity` 10 / `react-hooks/exhaustive-deps` 10 / `react-hooks/set-state-in-effect` 8 / `react-hooks/immutability` 4 / `prefer-const` 4 / `react-hooks/rules-of-hooks` 3
   - **次フェーズ候補**: 機械修正可能な prefer-const / no-unused-vars から段階的に解消 → 全体 lint の CI 必須化。react-hooks/rules-of-hooks 3件は要個別調査（潜在バグの可能性）

### v0.3.53-B hotfix: Codex 指摘対応（P1: CI が Git 管理外 / P2: lint 基準値）

1. **P1**: `.gitignore` が `.github/` 全体を除外していたため、ci.yml を置いても Git に載らない構造だった → 除外を `.github/workflows/keep-warm.yml` のみに変更（ci.yml は追跡可能に）
   - **副次的発見**: keep-warm.yml（5分おきの cold start 対策）も Git 管理外 = **GitHub 上で一度も実行されていなかった**。挙動を変えないため今回は除外を維持。有効化するかはオーナー判断（.gitignore の該当行を消して push するだけ）→ 次フェーズ候補
   - push 後の確認手順: `git ls-files .github/workflows/ci.yml` が出力を返すこと + GitHub Actions タブで「CI」がグリーン
2. **P2**: `eslint.config.mjs` の globalIgnores に `.test-dist/**` を追加（test:category の生成 JS が no-require-imports 3件を全体 lint に混入させていた）。正しい lint 基準値 = **144 problems（76 errors / 68 warnings）** に本文を訂正

### v0.3.53-B hotfix3: Actions のバージョン更新（Codex P2対応）

- `actions/checkout@v4` / `actions/setup-node@v4` → **@v6** に更新（v4 は内部 Node 20 が廃止予定で警告が出ていた。GitHub は現在 v4 を強制的に Node 24 で実行しており、公式現行版は Node 24 対応の v6）
- `node-version: 22` はアプリのテスト実行環境なので不変更（Action 自体の内部 Node とは別物）
- ⚠ ci.yml の編集は保護制約のため拓馬さんのターミナル (sed) で実施する運用

### v0.3.53-C: react-hooks/rules-of-hooks 3件の解消（実行時バグ予防）

**原因は3件とも共通**: `useMemo` がコンポーネントの early return（認証確認/詳細表示切替）の**後**にあり「条件付き Hook」になっていた。early return の条件が変わるたびに Hook の呼び出し順が変わり、実行時エラー（Rendered fewer hooks than expected）の温床だった。

1. `app/admin/planned-visits/page.tsx:156` — 日付グループ化の useMemo を認証 early return より前へ移動（認証確認中は rows=[] で計算コスト実質ゼロ）
2. `components/ManualSectionView.tsx:464/479` — stepBundle / irokoiBundle の useMemo を詳細表示 early return より前へ移動（filter/find 程度で軽微なため分割せず。openManualId/openThemeKey の状態・戻る挙動は無変更）
3. **付随対応**: planned-visits の no-explicit-any 1件 — Supabase select 結果の明示的な行型 `PlannedVisitRow` を定義（customers!inner は多対一でオブジェクト返り）。`as unknown as` 不使用
4. **品質ゲート追加**: `npm run lint:hooks-critical`（対象2ファイルの lint、error 0 維持）を package.json と ci.yml に追加
5. lint 全体: 144 → **140 problems（72 errors / 68 warnings）**。rules-of-hooks は **0件**。ManualSectionView の未使用警告2件（stripFrontmatter/MiniMarkdown）は Hook 修正と無関係のため不変更（既存の次フェーズ課題）

### v0.3.53-D: prefer-const 4件の機械的解消（挙動変更なし）

- 対象4変数とも「初期化後の再代入なし（push・プロパティ代入のみ = const で可能）」を確認のうえ let → const に変更。処理順・戻り値・APIレスポンス・画面表示は不変更
  1. `app/api/admin/all-casts-honshimei/route.ts` customersAll（push のみ）
  2. `app/api/auth/me/route.ts` permissions（プロパティ代入のみ）
  3. `app/api/auto-push/check/route.ts` visits（push のみ）
  4. `components/RankExplanationModal.tsx` castName（1回代入のみ。castId/castTier は再代入があるため let のまま）
- RankExplanationModal の他の指摘（未使用 CastProfile / no-explicit-any / exhaustive-deps）は今回対象外。特に exhaustive-deps は挙動に影響し得るため別フェーズで調査
- lint 全体: 140 → **136 problems（68 errors / 68 warnings）**。prefer-const は **0件**

### v0.3.53-D hotfix: auto-push の共通述語の巻き戻り復旧（Codex P2対応）

- **事象**: v0.3.53-D の const 化コミットが、auto-push/check の v0.3.53-A hotfix（isKpiKokyaku/isKpiKengai への共通化）を意図せず巻き戻していた（通知結果は等価だが分類集約の設計が崩れる）
- **原因**: 編集ベースにしたステージ済みコピーが hotfix 前の古い内容だった（ファイル取得のキャッシュが古い断面を返した）+ 編集後に該当箇所の存在確認をしなかった
- **復旧**: 実機ファイルを直接修正して共通述語を再適用（import + metaInput + isKpiKokyaku/isKpiKengai）。const visits は維持。tsc 0 / 対象 lint 0 / 全体 136 (68E/68W) / テスト 9/9
- **再発防止（開発ルール化）**: 過去に自分が変更したファイルを再編集する際は、①編集前にチェックサム/主要マーカー（今回なら isKpiKokyaku の有無）を実機と照合し、②編集後も「以前の変更が残っていること」を grep で確認する

## v0.3.53-E: RankExplanationModal の lint 3件解消（2026-07-17）

**目的**: components/RankExplanationModal.tsx に残っていた lint 3件（未使用 import / any / exhaustive-deps）を、eslint-disable や強制キャストなしで解消する。lint 段階解消の続き（136 → 133）。

### 変更内容（対象は RankExplanationModal.tsx のみ）

1. **未使用の `CastProfile` import を削除**
2. **`evalResult.rules: any` → `RankRules`**（@/types の既存型）
   - `rules` に入る値は `resolveRankRulesV2()` の戻り値 `{ criteria: RankCriteria; rules: RankRules }` の `rules` そのものなので、新しい型は作らず既存型をそのまま使用
   - 型が付いたことで、適用ルール詳細の描画にあった `(rule.conditions as RankCondition[])` キャストが不要になり削除（→ `RankCondition` import も未使用になるため合わせて削除。残すと新たな no-unused-vars になる）
3. **useEffect の依存配列に `customer.cast_name` / `customer.first_visit_date` を追加**
   - 変更前: `[open, customer.id, supabase]`
   - 変更後: `[open, customer.id, customer.cast_name, customer.first_visit_date, supabase]`
   - effect 内で実際に読んでいる customer のプロパティは id / cast_name / first_visit_date の3つで、これで網羅
   - **再実行条件**: モーダルを開いたとき（open false→true）、顧客が切り替わったとき（id）、担当キャストが変わったとき（cast_name → profiles 検索とスコープ解決に影響）、初回来店日が変わったとき（first_visit_date → 継続月数の計算に影響）

### 非同期競合ガード（依存追加に伴う安全策）

依存が増えた分、判定中に effect が再実行されるケース（顧客A表示中に顧客Bへ切り替え等）が増えるため、`let cancelled = false` + クリーンアップ `return () => { cancelled = true }` を追加。古い実行の `setEvalResult` / `setError` / `setLoading(false)` は `cancelled` チェックで無効化し、**古いリクエストの結果が新しい顧客の表示を上書きしない**ことを保証。なお `run()` 冒頭の `setEvalResult(null)` で開始時に前の結果を必ずクリアするため、前の顧客の判定結果が一瞬残ることもない（この動きは変更前から同じ）。

### 挙動維持の確認

- モーダル開閉・現在ランク・推奨ランク・適用ルール・12項目表示のロジックは無変更（型とガードのみ）
- 閉じて再度開いた場合の再取得も従来どおり（open が依存に入っているため）

### 検証結果

- npx eslint components/RankExplanationModal.tsx: **0件**
- npx tsc --noEmit: 0 エラー
- npm run test: 9/9 成功
- npm run lint:category / lint:hooks-critical: ともに 0
- npm run lint 全体: **136 → 133 problems (67 errors, 66 warnings)** — 3件減（no-unused-vars 1 / no-explicit-any 1 / exhaustive-deps 1）
- 他ファイルの lint 件数は変更なし（変更ファイルは RankExplanationModal.tsx のみ）
- 再発防止ルール適用: 編集前に実機と cksum 照合（390560923 → 一致確認後に反映）、反映後にマーカー grep（rules: RankRules / cancelled / 依存配列）で確認済み

## v0.3.53-F: 桜アニメーション機能の廃止（2026-07-17）

**オーナー判断で桜アニメーション機能を廃止。** どこからも呼ばれていない未使用コンポーネント2つを削除した（挙動変更なし）。

### 削除したファイル

- `components/ui/SakuraAnimation.tsx`（アニメ本体。lint: react-hooks/purity 7件を保有していた）
- `components/ui/SakuraAnimationSetting.tsx`（ON/OFF 設定 UI。lint: react-hooks/set-state-in-effect 1件を保有していた）

削除前の確認: 両ファイルは app/layout.tsx を含むどの実行コードからも import されておらず、参照は SakuraAnimationSetting → SakuraAnimation の内部 import のみ（grep で全リポジトリ確認）。よって削除による画面・機能の挙動変更はない。

### 触らなかったもの（意図的）

- `supabase/migrations/20260514_sakura_animation_toggle.sql` — **適用済みマイグレーションは変更・削除しない**（migration history の整合性維持）
- `app_settings.sakura_animation_enabled` カラム — 今回は削除しない。未使用カラムの削除は、必要になったら**別マイグレーションとして後日判断**
- localStorage の既存 `eclat.sakuraAnimation` 値 — 残っていても読む側のコードが消えたので実害なし。移行処理は作らない
- `docs/REBRAND_ROLLBACK.md` — 記述はカラムが残る現状と矛盾しないためそのまま

### ドキュメント更新

- `docs/REBRAND_ROADMAP.md`: 冒頭に廃止の注記を追加し、桜アニメ関連項目（12項目の#6、フェーズ0の2ファイル、フェーズ1の1-4/1-5、完了基準2行、フェーズ4の4-5）に【廃止 v0.3.53-F】を付記。1-6 は sakura マイグレーションが適用済みである旨に修正
- `docs/REBRAND_PHASE1_PR_SAMPLE.md`: 冒頭に「過去のサンプルであり、桜関連記述は廃止済みで適用不可」の注記を追加（本文は史料として保持）

### 検証結果

- SakuraAnimation / SakuraAnimationSetting の実行コード参照: **0件**（grep）
- npx tsc --noEmit: 0 エラー
- npm run test: 9/9 成功
- lint:category / lint:hooks-critical: ともに 0
- npm run lint 全体: **133 → 125 problems（59 errors / 66 warnings）** — 減少8件は SakuraAnimation の purity 7件（rule別集計 10→3）+ SakuraAnimationSetting の set-state-in-effect 1件（8→7）に完全一致。warnings は 66 のまま不変

## v0.3.54-A: ホーム画面の整理・操作文言の日本語化（2026-07-27）

**オーナー判断**: ホームから「今月のパフォーマンス」「店舗ダッシュボード」「キャスト本人用ダッシュボード」を廃止し、日常操作とスマホ通知設定に絞る。

### 変更内容

1. `app/home/page.tsx`
   - 上記3セクションと、表示のためだけに行っていた月次来店・売上・KPI・ランキング取得を削除
   - 既存の `PushSubscriptionButton` を配置し、端末の通知許可・テスト通知・解除をホームから操作可能にした
   - 表示切替を `MOBILE` / `PC` から「スマホ表示」/「パソコン表示」へ変更
2. ホーム専用で他画面から参照されていなかったコンポーネントと API を削除
   - `components/CastHomeDashboard.tsx`
   - `components/AdminHomeDashboard.tsx`
   - `app/api/cast/home-dashboard/route.ts`
   - `app/api/admin/home-dashboard/route.ts`
   - keep-warm 対象から上記2 API を削除
3. 通知 UI の操作文言を日本語に統一
   - 「スマホ通知を受け取る」「通知を許可する」「テスト通知」「通知を解除」など
   - NotificationBell の装飾見出し `NOTIFICATIONS` を「お知らせ」へ変更

### 今回の対象外

- 追いかけリスト・専用通知・入力フォーム整理・英語操作文言の日本語化は、続く v0.3.54-B〜D で実施

### 検証結果

- `npm run check`: 成功（tsc 0エラー / 顧客分類テスト 9/9）
- `npm run lint:category`: 指摘0
- `npm run lint:hooks-critical`: エラー0（既存警告2件のみ）
- 変更箇所の個別 eslint: 指摘0
- 全体 lint: **125 → 124 problems（59 errors / 65 warnings）**。削除したホーム専用コードにあった既存警告1件だけ減少し、新規指摘なし
- `git diff --check`: クリーン
- 削除した2コンポーネントの import、および2 APIへの実行コード参照: 0件
- ローカルサーバーは起動・ログイン画面応答まで確認。ホームの目視は認証セッションがないため未実施

## v0.3.54-B: 追いかけリスト（2026-07-27）

**オーナー確定仕様**: 追いかけは顧客ランク・指名状況・KPI・CUSTOMERS分類から独立した手動リストとする。自動判定は「候補」を表示するだけで、利用者の操作なしに追加・削除しない。「連絡した」後も、本人が明示的に外すまで追いかけ中へ残す。顧客を「切れた」に変更しても同様に残す。

### 変更内容

1. `customer_follow_ups` テーブルと RLS を追加
   - キャストは自分の担当顧客、管理者は権限確認後に全キャストを閲覧・操作
   - 追加・連絡日時・次回連絡日・メモ・明示的に外した履歴を保持
   - `customer_rank` 等の既存列は追いかけ操作では更新しない
2. `/follow-ups` を新設
   - 「追いかけ中」「候補」「履歴」の3タブ
   - 管理者は全キャスト表示とキャスト絞り込み、キャストは自分のリスト
   - 「連絡した」は `last_contacted_at` だけを更新し、一覧に残る
3. CUSTOMERS のお客様カード
   - 左スワイプまたは「操作」で「追いかけ」「切れたへ」を表示
   - スワイプできない環境でも操作ボタンから同じ機能を使える
   - 「切れたへ」では、追いかけ中なら残ることを確認文に明記
4. 下部メニューを「ホーム／顧客／追いかけ／接客／キャスト」の5項目に変更
   - 中央の追いかけだけ少し大きく上へ出し、iPhone の safe-area 分は下側に確保

### 自動候補（提案のみ）

- 対象は A/B ランクで、すでに追いかけ中のお客様は除外
- 来店3回以上: 個人の来店間隔中央値の1.5倍を超えた場合
- データ不足時: A=45日、B=60日の補助基準
- 直近60日とその前60日を比較できる場合: 来店回数または売上が50%以上減少
- 候補関数は純粋関数として実装し、ランク・顧客分類・DBを変更しない

## v0.3.54-C: 顧客登録・編集フォームの整理（2026-07-27）

- 常時表示の先頭カード: お客様名、ニックネーム、年代、地域、既婚、職業、指名状況
- 必須は「お客様名（呼び名・仮名でもOK）」だけ。APIでも空白のみを拒否する
- 地域は未登録のまま保存可能で、空欄は `NULL`。既存の地域未設定分類を維持
- 誕生日・指名経緯・営業情報・好み/注意・目標は折りたたみ式
- メモは折りたたまず、保存ボタンの直前に常時表示
- キャスト本人の新規登録は担当キャスト名を自動入力
- 既婚の選択肢は「既婚／未婚／わからない」と表示（DB値は既存互換の有／無／不明）

## v0.3.54-D: 毎日の追いかけ通知・日本語UI（2026-07-27）

### 通知

- ホームに端末のスマホ通知許可・テスト・解除と、キャスト本人用の「追いかけリストを毎日通知」設定を配置
- 追いかけ中が1人以上いる有効なキャストへ、Vercel Cron `0 5 * * *`（JST 14時台）で Web Push
- 同じキャストへ同日2回送らないよう `follow_up_reminder_log` の unique 制約で処理を確保
- 通知を押すと `/follow-ups` を開く。端末側でスマホ通知を許可していない場合は配信されない
- Service Worker の既存購読確認は、スクリプトURL `/sw.js` ではなく登録スコープ `/` で取得するよう修正

### 日本語UI

- 利用者が触る主要ボタン・タブ・画面見出しを日本語化
- 内部識別子（API、HTTPメソッド、KPI等の定着した業務略語）は変更しない
- 顧客詳細の PROFILE/STRATEGY/VISITS/BOTTLE、COPY/SAVE/EDIT/DEL/EXCEL 等を日本語へ変更

### 品質ゲート・検証

- `test:follow-ups` を追加し、自動候補の A/B限定・追いかけ中除外・個人間隔・補助基準・60日下降を4テストで固定
- `npm test`: 顧客分類9件 + 追いかけ候補4件 = **13/13成功**
- `npm run check`: tsc 0エラー
- `lint:category`: 0、`lint:follow-ups`: 0、`lint:hooks-critical`: error 0（既存警告2）
- 全体 lint: **123 problems（59 errors / 64 warnings）**。新規機能の対象lintは0
- `git diff --check`: クリーン

### デプロイ前の必須作業

1. `supabase/migrations/20260727_customer_follow_ups.sql` を本番DBへ適用
2. Vercel に既存の Web Push 用 VAPID 環境変数と `CRON_SECRET` が設定されていることを確認
3. コードをデプロイし、キャスト実機で通知許可・追いかけ追加・14時台通知を確認

## v0.3.54 レビュー対応（Codex実装 → Coworkレビュー、2026-07-27）

Cowork にコード変更なしの独立レビューを依頼し、P1なし / P2 2件 / P3 4件の報告を受けた。以下のとおり照合・対応した。

1. **P2 safe-area**
   - `app/layout.tsx` の Viewport に `viewportFit: 'cover'` を追加
   - `BottomNav` は下だけでなく左右にも `safe-area-inset-*` を適用
   - `viewport-fit=cover` 追加後に上端の操作がノッチ/ステータスバーへ入らないよう、共通 `PageHeader` と主要画面の最上位ヘッダーへ `safe-area-inset-top` 分の padding を追加
   - ログイン画面も上下左右の安全領域と従来24px余白の大きい方を使う
   - iPhone実機での縦/横・ホーム画面追加後の最終目視はデプロイ後必須
2. **P2 検証不能**
   - レビュー側ワークツリーに node_modules が無かったための環境差。Codex側では元リポジトリの node_modules を一時接続して実行済み
   - `npm run check`: tsc 0、仕様テスト13/13
   - `lint:follow-ups` / `lint:category`: 0
   - 全体 lint: 123（59 errors / 64 warnings）。main 125から2件減で記録どおり
3. **P3 日本語漏れ**
   - `LOADING...` 2箇所、`PASSWORD`、`NEW CAST` を日本語化
   - 追加棚卸しで見つけた `SERVICE CALENDAR` / `CUSTOMER LIST` も日本語化
4. **P3 cron claim後クラッシュ**
   - ログを先に確保する現在設計を維持。ごく短い claim→送信間のクラッシュでは当日再送されないが、二重配信を防ぐ安全側の優先順位とする
   - 厳密な再試行には processing token / lease / status を伴う状態機械が必要なため、通知運用で実害が出た場合の別フェーズ候補
5. **P3 担当変更後の通知ずれ**
   - cron で追いかけ行の `cast_id` と、現在の `customers.cast_name` / 有効キャストの `cast_name` を照合
   - 担当変更・担当解除済みの古い行は履歴として残すが、旧キャストへの通知人数・配信対象から除外
   - 管理者が古い行を見た場合は「担当変更あり・旧キャストへの通知対象外」と表示
6. **P3 admin RLS**
   - DBでは既存テーブル同様に role=admin を許可し、顧客.閲覧/編集の詳細権限はAPI層で強制する現行方針を維持
   - ブラウザから直接Supabaseを操作する新機能を追加する場合は、API経由を必須とするかDB権限モデルを再検討する

## v0.3.55-A: PC顧客ドロワー・スマホ操作改善（2026-07-27）

業務ルール・DB・APIは変更せず、PC/スマホの表示と操作性だけを改善する。

### PCのお客様詳細

- キャスト詳細から開くお客様ドロワーを画面幅50%固定から
  `min(1180px, calc(100vw - 96px))` へ拡張
- 内部幅が980px未満では、CustomerDetailPanel を2列から1列へ自動変更
- 狭い状態のタブは横スクロール可能にし、統計カードは2列表示
- 「戻る」を意味が明確な「× 閉じる」へ変更し、PCの「全画面で開く」は維持
- スマホでは全画面表示中のため、重複する「全画面で開く」を非表示

### スマホヘッダー

- 共通 PageHeader をグリッド化し、画面固有操作はスマホで2段目へ分離
- スマホでは重複するホームボタンを非表示にし、UserChip メニュー内へ「ホーム」を追加
- UserChip はスマホで38pxの人物アイコン、メニュー内で利用者名を表示
- 表示切替をUserChipメニューにも追加し、複数の useViewMode 間をカスタムイベントで同期
- ホーム・お客様一覧・共通 ViewModeToggle の表示切替はスマホヘッダーから非表示
- お客様一覧のヘッダーに重複していた「+ NEW」を削除し、既存の右下新規登録ボタンを維持

### お客様登録・編集

- 767px以下では「入力内容を保存する」を画面下に常時固定
- iPhone safe-area を下余白に含め、フォーム本体にもボタンと重ならない余白を追加
- 最下部の従来の保存・キャンセル操作は残し、保存処理・必須条件・送信データは変更しない

### 検証

- `npm run check`: tsc 0エラー、仕様テスト13/13成功
- 全体 lint: 123 problems（59 errors / 64 warnings）で変更前基準値と同一
- 変更行への新規 lint 指摘なし
- `git diff --check`: クリーン

### 独立レビュー対応

- ドロワー本体の `container-type: inline-size` が、配下の
  `position: fixed`（ランク説明・LINE提案モーダル、トースト、固定保存ボタン）の
  containing block を変える可能性があるとのP2指摘に対応
- container宣言をスクロールドロワーから削除し、CustomerDetailPanel の
  2列レイアウトだけを包む `.customer-detail-query-container` へ移動
- モーダル・トーストは専用コンテナの外側に置き、新規登録フォームも別要素のため、
  fixed要素は従来どおりビューポート基準を維持
- `responsiveContainer` は任意propとし、キャスト詳細ドロワーだけで有効化。
  既存の全画面表示・customers分割ペイン等の呼び出しは変更しない

## v0.3.56-A: 日常業務の案内・追いかけ整理・情報不足・プライバシー強化（2026-07-27）

### オーナー確定要件

- 誤操作しやすい「追いかけ追加／リストから外す／切れたへ」に8秒の「元に戻す」を付ける
- 追いかけ中のお客様は、次の行動と期限が一目で分かるようにする
- ホームは売上ダッシュボードに戻さず、今日開く場所の短い案内にする
- お客様カードは、指名状況・ランク・最終来店/連絡・次の追いかけを優先表示する
- 管理者は、キャスト・指名状況・不足項目で基本情報の不足を確認できる
- キャストアカウントは他キャストの顧客・メモ・写真・詳細情報を閲覧不可。全員分を見せる例外は既存ランキングだけ

### 追いかけと取り消し

- `customer_follow_ups.next_action` を追加し、`LINE／電話／来店相談／同伴相談／その他` だけを保存可能にした
- 追いかけ中を「期限超過／今日／今週（日曜まで）／それ以降／日付なし」に分類し、期限順に表示
- 「連絡した」は従来どおりリストへ残し、次の行動・次回連絡日・メモを同時保存
- 追いかけの追加と明示的な除外は、8秒以内なら逆操作で元に戻す
- CUSTOMERSカードの「切れたへ」は元ランクを記憶し、8秒以内なら元ランクへ戻す
- Undoトーストは iPhone の `safe-area-inset-bottom` より上へ表示

### ホーム・カード・管理者チェック

- ホームに「今日の来店予定／今日までの追いかけ／基本情報の不足」の3案内だけを追加。売上・KPI・店舗集計は追加しない
- お客様一覧検索APIは、検索結果に含まれる有効な追いかけ情報だけをRLS経由で付加
- お客様一覧とキャストCUSTOMERSカードに、指名状況・ランク・最終来店/連絡・次の行動/日付を表示
- `/admin/data-quality` を追加。教育上の基本7項目（お客様名、ニックネーム、年代、地域、既婚、職業、指名状況）を確認
- キャスト、担当未設定、指名状況（本指名／場内／フリー／未設定）、不足項目、名前で絞り込み可能
- 基本7項目は「情報不足チェック」の対象であり、保存必須条件は従来どおりお客様名だけ

### キャスト間データ分離

- 顧客・売上を含むキャスト詳細と顧客詳細は、前ログインユーザーのインメモリキャッシュを先に表示せず、現在セッションのRLSで毎回取得
- `useCasts` もプロフィール一覧・個別プロフィールの認証横断キャッシュを廃止。キャストにはprofiles RLSで自分だけを返す
- ログアウト時は認証キャッシュに加えてアプリ内メモリキャッシュを全消去
- service-role 集計の `badge-meta` / `latest-visits` は、キャストの `cast_name` が欠けていても管理者分岐へ落とさず0件を返す
- 本番 `pg_policies` の読み取り監査で `customer_contacts` / `customer_bottles` が
  `USING=true / WITH CHECK=true` だったことを確認。全件許可を廃止し、管理者全件／キャストは現在の担当顧客だけに作り直す
- `customer_visits` の旧admin書き込みポリシーは `current_role() != 'admin'` を含み、
  permissive policy のOR合成でキャストの担当顧客制限を迂回できたため、
  admin権限条件とキャスト担当顧客条件を独立した安全なポリシーへ再構成
- `customers` の旧 `allow_insert_for_all_users` を削除し、キャストの新規登録は既存の
  `customers_cast_insert`（自分の `cast_name` のみ）へ一本化
- `planned_visits` / `nomination_history` は `cast_id=self` に加えて、
  紐づく顧客の現在担当も `current_cast_name()` と一致することを必須化
- `customer_memos` のキャストRLSを `profiles.display_name` 比較から `current_cast_name()` へ修正
- private Storage `customer-photos` の認証ユーザー全件許可を廃止し、管理者全件／キャストは担当顧客IDフォルダだけに制限
- `/api/cast-rankings` はランキングに必要な集計値だけを返す既存例外として維持
- 本番適用前後は `supabase/verification/20260727_daily_workflow_privacy_verify.sql`
  を実行し、ポリシー一覧を保存して比較する。適用後は「危険」「不足」「想定外」が
  すべて0行、対象テーブルのRLSがすべてtrueであることを確認する
- SQL Editorで `storage.objects` のpolicy作成だけが所有権エラーになった場合は、
  public側の適用結果を確認したうえで、Storage → Policiesから
  `customer_photos_admin_all` / `customer_photos_cast_own` を同じ条件で作成し、
  上記検証SQLを再実行する

### 品質ゲート

- 追いかけ期限・次の行動2件、基本情報不足2件の自動テストを追加
- `npm run check`: tsc 0エラー、既存13件 + 新規4件 = 17/17成功
- `lint:follow-ups` / `lint:daily-workflow`: 指摘0
- 全体 lint: 122 problems（59 errors / 63 warnings）。既存問題の段階解消方針は維持
- 本番反映前に `20260727_daily_workflow_privacy.sql` の適用が必須

## v0.3.57: 体感速度改善（業務ルール・権限・表示項目は維持、2026-07-27）

### A: ホームと情報不足チェック

- ホームの3件数は、顧客・追いかけ・予定の全行をAPIへ転送してJavaScriptで数えず、
  `get_daily_workflow_summary()` がDB内で集計して1行だけ返す
- 情報不足チェックは約5,000件超の不足顧客を一括返却せず、DB view
  `customer_core_quality` で従来と同じ基本7項目を判定し、50件ずつ返す
- キャスト・指名状況・不足項目・名前の絞り込みもDB側へ移し、
  全体件数・項目別不足件数は `get_customer_core_quality_counts()` で集計する
- view / function はすべて `SECURITY INVOKER`。現在ユーザーのRLS可視範囲を維持する
- migration: `20260727_v0357_performance_phase_a.sql`

### B: お客様検索

- `customer_search_metrics` view で来店回数・累計売上・平均単価・最終/初回来店を集計
- APIが条件一致顧客全員と全来店履歴を返す方式を廃止し、50件ずつ返す
- 名前・ランク・最終連絡・指名状況の並び替え、表示調整の3条件もDB側で適用し、
  絞り込み後の正しい総人数を維持する
- 有効な追いかけ情報は、現在ページに表示する最大50人だけを追加取得する
- view は `SECURITY INVOKER` で customers / customer_visits の既存RLSを維持する
- migration: `20260727_v0357_performance_phase_b.sql`
- 本番適用時に `customers.score` が実DBでは `text` 型であることを確認。
  未登録判定は旧JavaScriptと同じく `NULL / ''` だけを未登録とし、文字列 `'0'` は
  truthy のため未登録扱いしない。verification SQLにも同判定の一致確認を追加

### C: キャスト詳細・顧客詳細

- キャスト詳細でKPI用と画面用に重複していた担当顧客・当月来店・延長売上・指名履歴を
  1回取得して共用する
- `getCastKPI` は任意の事前取得データを受け取れるようにし、他画面の既存呼び出しは維持
- 場内当月件数も共用した当月来店から算出し、従来の追加クエリを削除
- 顧客詳細は顧客本体を先に表示し、来店・連絡・ボトル・メモ・来店予定・担当IDを
  後から並列取得する。履歴取得中は0件と誤認させず「読込中」と表示する
- 顧客切替中の古い非同期結果は破棄し、前のお客様の履歴を表示しない

### D: 安全なキャッシュと画面先読み

- インメモリキャッシュはログインユーザーIDで名前空間を分離
- ユーザー未確認中はキャッシュを読み書きせず、ログアウト・ユーザー変更時は全破棄
- 取得途中でユーザーが変わった場合も、古い結果を画面コールバックや新ユーザーの
  キャッシュへ渡さない
- BottomNav は起動時に5ページ全部を先読みせず、pointer/focus/down の操作意図がある
  1ページだけ `router.prefetch()` する

### 適用順序・検証

1. `20260727_v0357_performance_phase_a.sql`
2. `20260727_v0357_performance_phase_b.sql`
3. 上記2本の適用後にアプリをデプロイ（先にコードを出すと新view/RPC未作成でAPIが失敗する）
4. `supabase/verification/20260727_v0357_performance_verify.sql` を実行し、
   mismatch / difference がすべて0、両viewの `security_invoker=true` を確認する

- `npm run check`: tsc 0、仕様テスト20/20（既存17 + キャッシュ分離3）
- `lint:category` / `lint:follow-ups` / `lint:daily-workflow` /
  `lint:performance`: 0
- `lint:hooks-critical`: 既存警告2、エラー0
- 全体 lint: 117 problems（54 errors / 63 warnings）。v0.3.56-Aの
  122（59 errors / 63 warnings）から、重複取得部分にあった既存anyを除去した分だけ5 errors減
- `npx next build --webpack`: 本番環境変数ありで成功
- 通常 `next build` のTurbopackは作業treeの `node_modules` が外部symlinkのため
  filesystem root制約で実行不能。コード原因ではなく、Webpackビルドで代替確認

## v0.3.58: 基本情報不足の再定義（2026-07-27）

### オーナー確定ルール

- 指名状況が `フリー` のお客様は、空欄があっても基本情報不足に含めない
- 顧客ランクが `切れた` のお客様は、指名状況に関係なく基本情報不足に含めない
- それ以外（本指名・場内・指名状況未設定等）は、従来の基本7項目で判定する
  - お客様名 / ニックネーム / 年代 / 地域 / 既婚 / 職業 / 指名状況
- フリーから場内・本指名へ変わった場合、または切れたから復帰した場合は、
  保存後の現在属性で自動的に不足判定を再開する
- 顧客分類・ランク自動判定・KPI・売上集計には影響させない

### 統一範囲

- ホームの「基本情報の不足」
- 管理者の `/admin/data-quality`
- お客様検索の「未登録あり」とカードの未登録項目表示
- JavaScriptの共通関数 `getMissingCoreCustomerFields`
- DB view `customer_core_quality` / `customer_search_metrics`

### DB・検証

- migration: `20260727_v0358_basic_info_definition.sql`
- verification: `20260727_v0358_basic_info_definition_verify.sql`
- 両viewは `SECURITY INVOKER` を維持し、現在ユーザーのRLS可視範囲だけを判定する

### 品質ゲート

- `npm run check`: TypeScript 0エラー、既存20件 + 新規3件 = 23/23成功
- 変更したTypeScript 6ファイルの単体lint: 指摘0
- 全体lint: 117 problems（54 errors / 63 warnings）でv0.3.57の基準値から増減なし
- 本番反映順序は migration → verification（差分0・権限true）→ アプリdeploy

### 本番DB適用結果

- `20260727_v0358_basic_info_definition.sql`: SQL Editorで適用成功
- verification:
  - `core_quality_mismatch` / `search_quality_mismatch`: 0
  - `excluded_free_incomplete` / `excluded_severed_incomplete`: 0
  - `unsafe_view_grant_count`: 0
  - `core_view_count_difference` / `search_view_count_difference`: 0
  - `rpc_incomplete_count_difference`: 0
  - `views_security_invoker_ok` / `authenticated_view_grants_ok`: true

## v0.3.59: 情報不足チェックのオーバーレイ編集（2026-07-27）

- `/admin/data-quality` の「開いて編集」はページ遷移せず、右側の編集オーバーレイを開く
- `CustomerDetailPanel` に任意の `initialEditing` を追加し、この画面だけ基本情報編集から開始
  - 未指定の既存呼び出しは従来どおり詳細画面から開始する
- 任意の `onEditCancelled` により、この画面ではフォーム内の戻る／キャンセルも
  詳細画面ではなく絞り込み結果へ戻す。既存呼び出しのキャンセル動作は変更しない
- 保存成功時はオーバーレイを自動で閉じ、現在の検索語・キャスト・指名状況・不足項目・
  ページ番号を維持したまま一覧を再取得する
- 再取得中も既存一覧を残すため、元のスクロール位置から作業を続けられる
- 編集後に不足条件から外れたお客様は再取得結果から自動的に消える
- PCは右側900px以内のドロワー、700px以下は全画面。safe-areaに対応
- 背景クリックとEscapeでは閉じず、入力途中の誤操作による消失を防ぐ
- フォーカストラップは未実装。キーボード操作の改善候補として別フェーズで扱う
- `npm run check`: TypeScript 0エラー、仕様テスト23/23成功
- `app/admin/data-quality/page.tsx` の単体lint: 指摘0
- `CustomerDetailPanel.tsx` の3件（any 1 / 未使用2）と全体117件（54E/63W）は
  v0.3.58以前からの既存指摘で、今回の追加行への新規指摘は0

## v0.3.60: ホームの日常操作整理（2026-07-27）

- 「今日の来店予定」カードは、上部の「接客カレンダー」と遷移先・役割が重複するため廃止
- 代わりに「新しいお客様」カードを追加し、既存の `/new` へ直接遷移
- 新規登録カードはキャスト、オーナー、または `顧客.編集` 権限のある管理スタッフだけに表示
- 「今日の確認」は「新しいお客様」「追いかけ中のお客様」「基本情報の不足」の3項目
  - 真ん中は期限到来人数ではなく、追いかけリストに選定中の合計人数を表示する
  - 押すと従来どおり `/follow-ups` へ遷移する
- キャストの「基本情報の不足」も検索画面ではなく `/data-quality` の専用一覧へ直接遷移
  - APIはキャストの `cast_name` に強制固定し、RLSとの二重防御で本人の担当顧客だけを返す
  - キャストには担当キャスト絞り込みを表示せず、編集パネルもキャスト権限で開く
  - 保存後は専用一覧へ戻り、該当条件から外れたお客様は自動的に一覧から消える
- `daily-summary` API / DB RPC の来店予定集計は互換性のため維持し、業務ロジック・
  接客カレンダー・通知・KPIには変更なし
- `npm run typecheck`: 0エラー、仕様テスト23/23成功
- 変更対象lint: 新規エラー0（`app/admin/casts/page.tsx` の警告2件は既存）
- `next build --webpack`: コンパイル・TypeScriptは成功。ローカルにSupabase環境変数がなく、
  既存 `/calendar` の静的生成で停止したため、最終ビルドはVercel CIで確認する

## v0.3.61: 追いかけ・顧客一括操作・ランク基準拡張（2026-07-27）

### オーナー確定ルール

- 追いかけリストの次回連絡日は「日付を取り消す」で未設定へ戻せる
- キャスト詳細の顧客一覧は複数選択し、「追いかけに追加」「切れたにする」を一括実行できる
  - 追いかけ中のお客様は追加対象から除外し、重複追加しない
  - 一括操作は成功した対象だけを8秒間の「元に戻す」の対象にする
- 自動ランク判定の対象は本指名だけ
- 場内・フリー等に既に保存されているランクは消さず、そのまま保持する
- 手動の「切れた」は指名状況を問わず使用可能
- 自動判定は `切れた → S → A → B → C` の順
  - CにもS/A/Bと同じ12項目の設定カードを追加
  - 「切れた」は最終来店からの日数等を使える独立基準として追加し、他ランクより先に評価
  - C・切れたの初期条件は安全のためOFF。管理者が確認してONにするまで既存顧客を再分類しない
  - 新設定でどの条件にも該当しない場合は現在ランクを維持
  - C・切れたを持たない旧S/A/B設定は、従来どおり該当なしをCにする

### 品質ゲート

- `npm run check`: TypeScript 0エラー、既存23件 + ランクルール6件 = 29/29成功
- ランクルールテストは旧設定互換、切れた優先、C独立条件、現在ランク維持、
  切れた固定、本指名限定を固定
- 変更した小規模ファイルの単体lintは指摘0
- `app/casts/[id]/page.tsx` の既存lint指摘は今回変更前からのもの。追加処理の型エラーは0
- DB migrationは不要（既存 `rank_criteria.rank_rules` JSONにC・切れたを追加保存）

### hotfix: 追いかけ状態が古い場合の一括Undo保護（2026-07-28）

- Coworkレビュー P3-2への対応
- 一括追加の直前に追いかけ一覧を再取得し、React stateの反映待ちではなく、
  取得関数が返す最新のactive顧客ID Setを直接使って追加対象を確定する
- GET完了後からPOSTまでの間に別画面で追加される競合も防ぐため、POST APIが
  `wasAlreadyActive` を返す
  - 元からactiveの行はDBを書き換えず、Undo対象に含めない
  - inactiveから再有効化した行と新規行だけUndo対象にする
- キャスト詳細の単体追加・一括追加・追いかけ候補からの追加で同じ判定を使用
- `npm run check`: TypeScript 0エラー、仕様テスト29/29成功
- `lint:follow-ups` / `lint:rank-rules`: 指摘0

## v0.3.62: 顧客検索・接客カレンダーの顧客操作統一（2026-07-28）

- 顧客検索 `/customers` と接客カレンダー `/calendar` の日別顧客一覧にも、
  キャスト詳細と同じ「追いかけ」「切れた」の操作を追加
  - スマホは顧客カードを左へスワイプ、PCはカード右上の「…」から操作する
  - 「複数選択」中はカードの詳細表示・スワイプを止め、画面下の固定バーから
    「追いかけに追加」「切れたにする」を一括実行する
  - 同じお客様に同日の来店記録が複数あっても、複数選択では1人として扱う
- 一括追いかけはv0.3.61 hotfixと同じ二重防御を共通フックへ実装
  - 実行直前に最新のactive顧客IDを取得
  - POSTの `wasAlreadyActive` でも競合を判定し、元から追いかけ中の行をUndoしない
- 単体・一括とも成功分だけ8秒間「元に戻す」が可能
  - 切れたのUndoはお客様ごとの変更前ランク（NULL含む）へ戻す
  - 部分失敗時は成功分だけ反映・Undoし、失敗人数を通知する
- 操作表示はキャスト、オーナー、または `顧客.編集` 権限のある管理スタッフだけ
  - APIの権限検査とcustomers / follow-upのRLSは既存経路を維持
  - キャストはURLや画面操作を変えても担当外顧客を操作できない
- 接客カレンダーの埋め込みcustomer型を明示し、既存の `any` 5件と未使用警告2件も解消
- CIに `lint:customer-actions` を追加
- `npm run typecheck`: 0エラー、既存テスト29/29成功、変更4ファイルlint指摘0
- 全体lintは117件から110件（49 errors / 61 warnings）へ減少。今回の新規指摘0
- DB migration / API仕様変更なし

## v0.3.63: 追いかけリストの行動・期限管理を再設計（2026-07-28）

### オーナー確定ルール

- 追いかけリスト固有の「次回連絡日」は廃止し、「再来店期限」へ置き換える
  - 明日 / 3日以内 / 1週間以内 / 2週間以内 / 1ヶ月以内 / 2ヶ月以内 /
    3ヶ月以内 / 半年以内から選択する
  - 選択時のJST日付から絶対期限日を保存し、あと何日・今日まで・何日超過を表示する
  - 同じ選択肢のままメモ等を保存しても絶対期限を先送りしない。選択し直した時だけ再計算する
- 次の行動は複数選択にする
  - 営業連絡 / 関係値づくり / 来店斡旋 / 同伴斡旋 / アフター斡旋 /
    プライベートで関係値づくり
- 営業連絡間隔を追加する
  - 毎日 / 2日以上空けない / 3日以上空けない / 1週間以上空けない /
    2週間以上空けない / 1ヶ月以上空けない
  - 未連絡時は追いかけ開始日を起点にし、「連絡した」を押した後はその日から数え直す
- 追いかけ中の一覧は、現在の指名状況に基づき「本指名 / 場内 / フリー」に分ける
  - 指名状況が未設定・不正値の既存データは「未設定・その他」に退避し、非表示にしない
- 14時台の通知は、旧次回連絡日ではなく、営業連絡期限または再来店期限が
  今日以前のお客様を「確認が必要」として数える

### 互換性・DB

- `customer_follow_ups` に `return_visit_deadline` /
  `return_visit_deadline_preset` / `next_actions` /
  `sales_contact_interval_days` を追加する
- 適用済みデータと旧アプリへの切り戻し互換のため、旧 `next_contact_date` /
  `next_action` は削除しない。v0.3.63の画面と通知からは参照しない
- 顧客ランク、指名分類、KPI、自動ランク判定、追いかけの手動追加・Undo、
  キャストごとのRLSには変更を加えない
- 本番反映順序は migration → verification → アプリdeploy
