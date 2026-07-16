# Éclat リブランド実装ロードマップ (F-2 最終確定版)

最終更新: 2026-07-17
ステータス: フェーズ0 (準備) 完了、フェーズ1 着手前

> **【2026-07-17 更新】桜アニメーション機能はオーナー判断で廃止 (v0.3.53-F)**
> `components/ui/SakuraAnimation.tsx` / `SakuraAnimationSetting.tsx` は削除済み。
> 適用済みマイグレーション `20260514_sakura_animation_toggle.sql` と
> `app_settings.sakura_animation_enabled` カラムは変更せずそのまま残す
> (未使用カラムの削除は必要になったら別マイグレーションとして後日判断)。
> 本書の桜アニメ関連項目には【廃止】を付記した。

---

## 12項目 確定事項

| # | 項目 | 確定内容 |
|---|------|----------|
| 1 | キャスト層 | A層/B層/新人層/無類/C層 **＋「その他」** の6区分 |
| 2 | フォント | **Zen Maru Gothic** (全体) |
| 3 | カラーパレット | 既存 `lib/colors.ts` を桜系階調に微調整 (詳細別途) |
| 4 | 顧客ランクの色 | **桜系階調** S=#D45060 / A=#E8879B / B=#F4A5B8 / C=#FFE4ED |
| 5 | 「無類」表現 | **白背景＋ピンク枠線＋🌸** (別軸スタイル) |
| 6 | 桜アニメ | 【廃止 2026-07-17 (v0.3.53-F)】~~**ON/OFF 切替必要** (app_settings + localStorage の二段)~~ — オーナー判断で不採用・コンポーネント削除済み |
| 7 | 管理画面の装飾 | 薄く 5% (操作優先) |
| 8 | ボトムナビ | 5 タブ (顧客/接客/キャスト/管理/**教科書**) |
| 9 | 教科書 | iframe → Native React 化、cast にも公開 |
| 10 | チャート | recharts 未導入、当面は手書き SVG 維持 |
| 11 | PWA アイコン | 桜モチーフに刷新 (フェーズ4) |
| 12 | レスポンシブ | PC/モバイル 768px ブレイクで分岐 (既存 useViewMode 流用) |

---

## DB 分布から読み取れる重要ポイント

| 区分 | 件数 | 占有率 | 設計判断 |
|------|------|--------|----------|
| キャスト A層 | 3 | 9% | **希少** — ランキング上位の演出を強める |
| キャスト B層 | 11 | 33% | 主力 — 通常スタイル |
| キャスト C層 | 4 | 12% | グレー系 |
| キャスト 新人層 | 5 | 15% | グリーン (新鮮さ) |
| **キャスト 無類** | **9** | **27%** | **白背景＋🌸 特殊表現** — 無印が主役級 |
| キャスト NULL | 1 | 3% | 「その他」へ振り直し候補 |
| **顧客 B/C ランク** | **1129** | **95%** | **大量** — リスト描画パフォーマンス最優先 |
| 顧客 S ランク | 10 | <1% | 演出を強める (深紅 #D45060) |
| 顧客 A ランク | 27 | 2% | 濃ピンク (#E8879B) |

→ **設計の要点**:
1. 顧客リストの描画は 95% が B/C なので、淡ピンク (#F4A5B8 / #FFE4ED) でも一覧で疲れない明度に
2. 無類は 27% と多いため通常スタイルで埋もれず、かつ階層的に目立ち過ぎない「白＋枠＋🌸」に
3. A 層 (9%) のキャストには CastRankingTab で軽い金色アクセントを残す

---

## フェーズ概要

| フェーズ | 目的 | 工数目安 | 依存 | 状態 |
|---------|------|----------|------|------|
| 0 | 準備 (マイグレ・UI部品・~~桜アニメ機構~~【廃止】) | 1日 | なし | ✅ 完了 |
| 1 | グローバル基盤 (フォント・color tokens・layout) | 2日 | 0 完了 | ⬜ 着手前 |
| 2 | 共通部品移行 (Avatar/Button/Card/Modal 全置換) | 3日 | 1 完了 | ⬜ |
| 3 | ページ単位リブランド (12 ルート × バッチ) | 5日 | 2 完了 | ⬜ |
| 4 | 仕上げ (PWA アイコン・誕生日Push・教科書Native) | 2日 | 3 完了 | ⬜ |

---

## フェーズ 0 (準備) — ✅ 完了

- [x] マイグレーション `20260514_rebrand_redesign.sql` (cast_tier「その他」追加)
- [x] マイグレーション `20260514_sakura_animation_toggle.sql` (sakura_animation_enabled 追加) — 【メモ】適用済みのため v0.3.53-F 廃止後もマイグレーション・カラムはそのまま残す
- [x] `components/ui/Avatar.tsx` (customerRank/castTier props, 桜系階調, 無類特殊)
- [x] `components/ui/Button.tsx` (primary/outline/ghost/danger)
- [x] `components/ui/Card.tsx` (default/raised/soft/flat, borderHighlight)
- [x] `components/ui/Modal.tsx` (centered/fullscreen)
- ~~[x] `components/ui/SakuraAnimation.tsx` (アニメ本体, 3段優先順位)~~ 【廃止 v0.3.53-F・ファイル削除済み】
- ~~[x] `components/ui/SakuraAnimationSetting.tsx` (ユーザー設定 UI)~~ 【廃止 v0.3.53-F・ファイル削除済み】

**完了基準**: 全ファイル作成済み、TypeScript ビルド通る、既存ページに未影響。

---

## フェーズ 1 (グローバル基盤) — 2日

ブランチ: `rebrand/phase1-globals`
タグ: `rebrand-phase1-start` (フェーズ前) / `rebrand-phase1-done` (完了時)

### タスク
- [ ] **1-1**: `lib/colors.ts` を桜系階調に微調整 (PR 1)
- [ ] **1-2**: `app/layout.tsx` で `Zen_Maru_Gothic` を `next/font/google` から導入 (PR 1)
- [ ] **1-3**: `app/globals.css` に桜の background-tint と font-family を反映 (PR 1)
- ~~[ ] **1-4**: `<SakuraAnimation />` を layout.tsx の `<body>` 直下に配置 (PR 1)~~ 【廃止 v0.3.53-F】
- ~~[ ] **1-5**: `app_settings` テーブルから `sakura_animation_enabled` を SSR で取得して props 渡し (PR 1)~~ 【廃止 v0.3.53-F】
- [ ] **1-6**: マイグレーション本番適用 (Supabase) — `20260514_rebrand_redesign.sql` (※ `20260514_sakura_animation_toggle.sql` は適用済み・そのまま残す)

### 完了基準
- ホーム画面を開いて、フォントが Zen Maru Gothic に変わっている
- ~~桜の花びらが背景で舞っている~~ 【廃止 v0.3.53-F】
- ~~管理画面 → 設定 → 桜アニメ OFF で、即座に止まる~~ 【廃止 v0.3.53-F】
- 既存機能 (顧客一覧/シフト等) は完全に動作

### ロールバック手順
1. Vercel で `rebrand-phase1-start` タグへ revert デプロイ
2. (DBは追加のみなのでロールバック不要、放置可)

---

## フェーズ 2 (共通部品移行) — 3日

ブランチ: `rebrand/phase2-components`
タグ: `rebrand-phase2-start` / `rebrand-phase2-done`

### タスク (バッチ単位で PR 化)
- [ ] **2-A** Avatar 全置換 — `grep "borderRadius: '50%'"` で約 15 箇所
- [ ] **2-B** Button 全置換 — primary/outline/ghost を grep して順次
- [ ] **2-C** Card 全置換 — `border: 1px solid C.border, borderRadius: 12` で grep
- [ ] **2-D** Modal 全置換 — 既存の手書きモーダル 7 箇所
  - `LineMessageProposerModal`, `RankExplanationModal`, `SalesListExportModal`,
    `RankRecalcModal`, `BirthdayReminder` 内モーダル, `CustomerDetailPanel` 内モーダル, etc.
- [ ] **2-E** リファクタ後の差分動作確認 (一覧/詳細/モーダル開閉)

### 完了基準
- すべてのアバター・ボタン・カード・モーダルが共通部品経由
- 顧客ランクが桜系階調で表示される (S=深紅, A=濃ピンク, B=淡ピンク, C=極淡)
- 「無類」キャストが白＋ピンク枠＋🌸 で識別できる

### ロールバック手順
- バッチ単位で `git revert` 可能 (PR 単位で分割しているため)

---

## フェーズ 3 (ページ単位リブランド) — 5日

ブランチ: `rebrand/phase3-pages-<route>`
タグ: ルート単位でなくフェーズ単位で `rebrand-phase3-start` / `rebrand-phase3-done`

### ルート別タスク (12 ルート、優先度高い順)
- [ ] **3-1** `app/page.tsx` (ホーム) — 顧客リスト、95% B/C 対応
- [ ] **3-2** `app/customer/[id]/page.tsx` (顧客詳細)
- [ ] **3-3** `app/casts/[id]/page.tsx` (キャスト詳細 + KPI/RANKING タブ)
- [ ] **3-4** `app/new/page.tsx` (新規登録)
- [ ] **3-5** `app/admin/casts/page.tsx` (管理者メイン)
- [ ] **3-6** `app/admin/daily-sales/page.tsx`
- [ ] **3-7** `app/admin/shifts/page.tsx`
- [ ] **3-8** `app/admin/performance/page.tsx`
- [ ] **3-9** `app/admin/targets/page.tsx`
- [ ] **3-10** `app/admin/rank-criteria/page.tsx`
- [ ] **3-11** `app/admin/monthly-report/page.tsx`
- [ ] **3-12** `app/admin/cast-analysis/page.tsx`
- [ ] **3-X** 教科書アプリ Native 化 (フェーズ4 と重複部分あり)

### 完了基準
- 全 12 ルートで桜系階調が反映
- ボトムナビが 5 タブ化
- 管理画面の装飾は控えめ (5%)

---

## フェーズ 4 (仕上げ) — 2日

ブランチ: `rebrand/phase4-polish`
タグ: `rebrand-phase4-start` / `rebrand-phase4-done`

### タスク
- [ ] **4-1** PWA アイコン (192/512) を桜モチーフに刷新
- [ ] **4-2** `manifest.json` の theme_color / background_color 更新
- [ ] **4-3** 誕生日 Push 自動配信ジョブ (Vercel Cron)
- [ ] **4-4** 教科書 Native 版 (P-11) — iframe から React 化、cast に公開
- ~~[ ] **4-5** ローディング画面に小さな桜アニメ (フェーズ1の SakuraAnimation を流用)~~ 【廃止 v0.3.53-F・流用元コンポーネント削除済み】

### 完了基準
- iOS/Android のホーム画面に追加したアイコンが新ロゴ
- 誕生日当日朝 9 時に該当顧客の担当キャストへ自動 Push
- キャストも教科書アプリにアクセス可能 (権限ガード)

---

## Git タグ運用

```bash
# フェーズ着手前 (ロールバック先)
git tag rebrand-phase1-start
git push origin rebrand-phase1-start

# フェーズ完了時 (ロールバック先 = 次フェーズの安定地点)
git tag rebrand-phase1-done
git push origin rebrand-phase1-done

# 緊急ロールバック
vercel rollback rebrand-phase1-done   # Vercel ダッシュボードでも可
```

---

## 依存関係マトリクス

```
フェーズ 0 (準備)
   ↓
フェーズ 1 (基盤) ──→ ここで色とフォントが全画面に効く
   ↓
フェーズ 2 (部品) ──→ Avatar/Button/Card/Modal が桜化
   ↓
フェーズ 3 (ページ) ─→ 各ページ個別の inline style を整理、ここでブランド完成
   ↓
フェーズ 4 (仕上げ)
```

→ フェーズ 1 だけで「見た目が桜化」する。フェーズ 2 以降は段階的に磨いていく。
