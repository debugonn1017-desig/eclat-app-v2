#!/usr/bin/env bash
# ─────────────────────────────────────────────────
# Éclat 簡易 push スクリプト
#
# 使い方:
#   bash scripts/ship.sh "feat: メッセージ"
#   bash scripts/ship.sh   ← メッセージ省略で chore: update
#
# 動作:
#   1. .git/index.lock を削除（残骸対策）
#   2. *.bak ファイルを削除（誤コミット防止）
#   3. git add -A
#   4. 変更があれば commit、なければスキップ
#   5. git push origin (現在のブランチ)
# ─────────────────────────────────────────────────
set -e

# 引数を全部メッセージとして連結（クオート不要）
MSG="${*:-"chore: update"}"

# スクリプトのある場所からプロジェクトルートへ
cd "$(dirname "$0")/.."

# 後始末：lock と bak の残骸を掃除
rm -f .git/index.lock 2>/dev/null || true
find . -name "*.tsx.bak*" -not -path "./node_modules/*" -not -path "./.next/*" -delete 2>/dev/null || true
find . -name "*.ts.bak*" -not -path "./node_modules/*" -not -path "./.next/*" -delete 2>/dev/null || true

# 現在のブランチ取得
BRANCH=$(git rev-parse --abbrev-ref HEAD)

git add -A

# ステージングに差分があれば commit
if git diff --staged --quiet; then
  echo "ℹ️  変更なし。push だけ実行します。"
else
  git commit -m "$MSG"
fi

git push origin "$BRANCH"
echo ""
echo "✅ push 完了 → $BRANCH"
