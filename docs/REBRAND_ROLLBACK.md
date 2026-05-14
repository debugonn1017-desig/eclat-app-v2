# Éclat リブランド ロールバック手順書

## Git タグ運用

### フェーズ着手前（必ずタグを打つ）

```bash
# 例: フェーズ1 着手前
git checkout main
git pull origin main
git tag rebrand-phase1-start
git push origin rebrand-phase1-start
```

### フェーズ完了時

```bash
# rebrand/phase1-globals ブランチをマージ後
git checkout main
git pull origin main
git tag rebrand-phase1-done
git push origin rebrand-phase1-done
```

### タグ命名規則

| タグ | 用途 |
|------|------|
| `rebrand-phase0-done` | 準備完了 (UI部品作成済み) |
| `rebrand-phase1-start` | フェーズ1 着手直前 (ロールバック先) |
| `rebrand-phase1-done` | フェーズ1 完了 (次フェーズ着手直前) |
| `rebrand-phase2-start` | フェーズ2 着手直前 |
| ... | (各フェーズで同様) |
| `rebrand-final` | 全フェーズ完了の最終タグ |

---

## ロールバック手順

### A) コード（Vercel）

```bash
# 1. Vercel ダッシュボードでロールバック対象デプロイを探す
#    https://vercel.com/<your-team>/eclat-app/deployments

# 2. 該当デプロイの "..." メニュー → "Promote to Production"
#    (もしくは CLI で)
vercel rollback <deployment-url> --token=$VERCEL_TOKEN

# 3. 必要なら git も巻き戻す
git checkout main
git reset --hard rebrand-phase1-start
git push origin main --force-with-lease
```

### B) DB（Supabase）

リブランドの DB マイグレーションは「追加のみ」なので**通常ロールバック不要**です。
万が一巻き戻したい場合のみ、各マイグレーションのコメント末尾にロールバック SQL を用意しています。

- `20260514_rebrand_redesign.sql` — cast_tier「その他」を「無類」に移動して制約を元に戻す
- `20260514_sakura_animation_toggle.sql` — `sakura_animation_enabled` カラム削除

### C) 緊急時の桜アニメ即 OFF

DB を触らずに**全ユーザー一律で桜アニメだけ止めたい**場合:

```sql
-- Supabase SQL Editor で実行
update public.app_settings set sakura_animation_enabled = false;
```

→ 次のページロードから全ユーザー OFF。コードデプロイ不要。

---

## 完全ロールバック手順（全リブランドを巻き戻す最終手段）

```bash
# 1. main を phase0-done に戻す
git checkout main
git reset --hard rebrand-phase0-done
git push origin main --force-with-lease

# 2. Vercel が自動デプロイ (約1-2分)

# 3. DB は「追加のみ」なので触らない (放置 OK)
#    気持ち悪ければ各ロールバック SQL を順番に実行
```

→ コード上はリブランド前。DBには `cast_tier='その他'` と `sakura_animation_enabled` が残るが
   どちらも参照されないので無害（次回再着手時にそのまま使える）。
