#!/usr/bin/env bash
# =============================================================================
# プロジェクトフックの空打ちテスト（carenote-ai ── 2026-07-08 ガード所有権分割で新設）
# 汎用の危険 Bash ガード（force push / reset --hard / clean -f / supabase db reset /
# .env の git add）は ~/.claude/hooks/pre-bash-guard.py（グローバル層・30件PASS済）が
# 所有し、本プロジェクトの pre-tool-guard.sh は撤去済み（旧版は -f 短縮形を素通しする
# ドリフト版だった）。層の分担表の正本= ~/.claude/docs/harness/HARNESS-RUNBOOK.md §5。
# このテストが見るもの: ①残存2フックの構文と fail-open ②撤去の再ドリフト検知。
# 使い方: bash .claude/hooks/test_project_hooks.sh
# =============================================================================
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
PASS=0; FAIL=0
check() { # $1=label $2=expected $3=actual
  if [[ "$2" == "$3" ]]; then echo "  PASS: $1 (exit=$3)"; PASS=$((PASS+1))
  else echo "  FAIL: $1 (expected=$2 got=$3)"; FAIL=$((FAIL+1)); fi
}

echo "[構文] 残存2本とも bash -n が通る"
for f in post-edit-format.sh stop-build-check.sh; do
  if bash -n "$DIR/$f" 2>/dev/null; then echo "  PASS: $f syntax"; PASS=$((PASS+1))
  else echo "  FAIL: $f syntax"; FAIL=$((FAIL+1)); fi
done

echo "[再ドリフト検知] pre-tool-guard.sh は存在しない（汎用ガードはグローバル層が所有）"
if [[ ! -e "$DIR/pre-tool-guard.sh" ]]; then echo "  PASS: 撤去済み"; PASS=$((PASS+1))
else echo "  FAIL: pre-tool-guard.sh が復活している（グローバル層と重複＝ドリフトの温床）"; FAIL=$((FAIL+1)); fi

echo "[再ドリフト検知] settings.json に pre-tool-guard の登録が残っていない"
if ! grep -q "pre-tool-guard" "$DIR/../settings.json"; then echo "  PASS: 登録なし"; PASS=$((PASS+1))
else echo "  FAIL: settings.json に登録が残存（存在しないフックの呼び出し）"; FAIL=$((FAIL+1)); fi

echo "[settings.json] JSON として壊れていない"
if python -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$DIR/../settings.json" 2>/dev/null; then
  echo "  PASS: valid JSON"; PASS=$((PASS+1))
else echo "  FAIL: settings.json がパース不能"; FAIL=$((FAIL+1)); fi

echo "[post-edit-format] 不存在ファイル・空ペイロードは即通す(0・fail-open)"
CODE=$(printf '%s' '{"tool_input":{"file_path":"/nonexistent/x.ts"}}' | bash "$DIR/post-edit-format.sh" >/dev/null 2>&1; echo $?)
check "missing file fast-pass" 0 "$CODE"
CODE=$(printf '%s' '{}' | bash "$DIR/post-edit-format.sh" >/dev/null 2>&1; echo $?)
check "empty payload fast-pass" 0 "$CODE"

echo "--------------------------------------------"
echo "PASS=$PASS FAIL=$FAIL"
[[ "$FAIL" -eq 0 ]]
