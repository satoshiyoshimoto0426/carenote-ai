#!/usr/bin/env bash
# PostToolUse: Biome で自動フォーマット（carenote-ai）
# Edit / Write 直後に呼ばれ、編集ファイルだけを対象に整形する

FILE_PATH="${CLAUDE_FILE_PATH:-}"

if [[ -z "$FILE_PATH" ]]; then
  # 標準入力 JSON から拾うフォールバック
  PAYLOAD=$(cat 2>/dev/null || true)
  FILE_PATH=$(printf '%s' "$PAYLOAD" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
fi

if [[ -z "$FILE_PATH" || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mts|*.cts|*.json|*.jsonc)
    # carenote-ai ルート（このスクリプトの2つ上）から biome を実行
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
    if [[ -f "$PROJECT_ROOT/biome.json" ]]; then
      (cd "$PROJECT_ROOT" && npx --no-install biome check --write "$FILE_PATH" 2>/dev/null) || true
    fi
    ;;
esac

exit 0
