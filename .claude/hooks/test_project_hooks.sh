#!/usr/bin/env bash
# =============================================================================
# プロジェクトフックの空打ちテスト（carenote-ai ── 2026-07-08 ガード所有権分割で新設）
# 汎用の危険 Bash ガード（force push / reset --hard / clean -f / supabase db reset /
# .env の git add）は ~/.claude/hooks/pre-bash-guard.py（グローバル層・30件PASS済）が
# 所有する（正本= ~/.claude/docs/harness/HARNESS-RUNBOOK.md §5）。
# pre-tool-guard.sh はグローバル層不在環境専用の fail-safe に縮退済み
# （maoucastle-game PR#5 独立審査 Critical「未導入環境でのフェイルオープン」対処）。
# HOME 差し替えで「グローバル層あり／なし」を再現し、実行環境に依らず決定的に検証する。
# 使い方: bash .claude/hooks/test_project_hooks.sh
# =============================================================================
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0
check() { # $1=label $2=expected $3=actual
  if [[ "$2" == "$3" ]]; then echo "  PASS: $1 (exit=$3)"; PASS=$((PASS+1))
  else echo "  FAIL: $1 (expected=$2 got=$3)"; FAIL=$((FAIL+1)); fi
}

echo "[構文] 3本とも bash -n が通る"
for f in pre-tool-guard.sh post-edit-format.sh stop-build-check.sh; do
  if bash -n "$DIR/$f" 2>/dev/null; then echo "  PASS: $f syntax"; PASS=$((PASS+1))
  else echo "  FAIL: $f syntax"; FAIL=$((FAIL+1)); fi
done

echo "[settings.json] JSON として壊れていない"
if python -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$DIR/../settings.json" 2>/dev/null; then
  echo "  PASS: valid JSON"; PASS=$((PASS+1))
else echo "  FAIL: settings.json がパース不能"; FAIL=$((FAIL+1)); fi

# 環境シミュレーション: グローバル層あり／なし
HOME_WITH=$(mktemp -d); mkdir -p "$HOME_WITH/.claude/hooks"; : > "$HOME_WITH/.claude/hooks/pre-bash-guard.py"
HOME_WITHOUT=$(mktemp -d)

echo "[pre-tool-guard] 所有者（グローバル層）がいる環境では休眠すべき(0・再ドリフト検知)"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' | HOME="$HOME_WITH" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "force push はグローバル層に委譲（素通し）" 0 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"supabase db reset"}}' | HOME="$HOME_WITH" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "supabase db reset はグローバル層に委譲（素通し）" 0 "$CODE"

echo "[pre-tool-guard] fail-safe: グローバル層不在の環境では block すべき(2)"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: force push block" 2 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push -f origin main"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: -f 短縮形 block（旧版で素通しだったドリフト穴の根治）" 2 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git reset --hard HEAD~1"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: reset --hard block" 2 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"supabase db reset"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: supabase db reset block" 2 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git add .env.local"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: .env add block" 2 "$CODE"
CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git push -u origin feature"}}' | HOME="$HOME_WITHOUT" bash "$DIR/pre-tool-guard.sh" >/dev/null 2>&1; echo $?)
check "fallback: 通常 push は通す" 0 "$CODE"
rm -rf "$HOME_WITH" "$HOME_WITHOUT"

echo "[グローバル層契約] 実物 pre-bash-guard.py の応答を確認（委譲先が責務を果たす証拠）"
GG="$HOME/.claude/hooks/pre-bash-guard.py"
if [ -f "$GG" ]; then
  CODE=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git add .env"}}' | python "$GG" >/dev/null 2>&1; echo $?)
  check "global: .env add → block" 2 "$CODE"
  OUT_G=$(printf '%s' '{"tool_name":"Bash","tool_input":{"command":"supabase db reset"}}' | python "$GG" 2>/dev/null)
  if [[ "$OUT_G" == *'"permissionDecision": "ask"'* ]]; then
    echo "  PASS: global: supabase db reset → ask"; PASS=$((PASS+1))
  else
    echo "  FAIL: global: supabase db reset が ask を返さない out='$OUT_G'"; FAIL=$((FAIL+1))
  fi
else
  echo "  SKIP: グローバル層不在の環境（上の fail-safe が受けることをテスト済み）"
fi

echo "[post-edit-format] 不存在ファイル・空ペイロードは即通す(0・fail-open)"
CODE=$(printf '%s' '{"tool_input":{"file_path":"/nonexistent/x.ts"}}' | bash "$DIR/post-edit-format.sh" >/dev/null 2>&1; echo $?)
check "missing file fast-pass" 0 "$CODE"
CODE=$(printf '%s' '{}' | bash "$DIR/post-edit-format.sh" >/dev/null 2>&1; echo $?)
check "empty payload fast-pass" 0 "$CODE"

echo "--------------------------------------------"
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
