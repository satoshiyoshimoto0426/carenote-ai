#!/usr/bin/env bash
# PreToolUse: fail-safe フォールバック専用（carenote-ai ── 2026-07-08 ガード所有権分割）
# 汎用の危険 Bash ガード（force push / reset --hard / clean -f / supabase db reset /
# .env の git add）は ~/.claude/hooks/pre-bash-guard.py（グローバル層）が ask/block で
# 所有する（正本= ~/.claude/docs/harness/HARNESS-RUNBOOK.md §5・decisions-log 2026-07-08）。
# 本フックはグローバル層が未導入の環境（CI ランナー・新規マシン）でのみ発動する非常口
# ── 未導入だと移管ガードが完全な素通しになるため（maoucastle-game PR#5 独立審査 Critical）。
# ⚠️ 複製ではなく非常口: パターン更新はグローバル層のみで行い、ここは触らない。

INPUT=$(cat 2>/dev/null || true)

# 所有者（グローバル層）がいる環境では休眠 ── ask 意味論はそちらが提供する
if [[ -f "$HOME/.claude/hooks/pre-bash-guard.py" ]]; then
  exit 0
fi

TOOL_NAME=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || true)
TOOL_INPUT=$(echo "$INPUT" | python -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null || echo "{}")

if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || true)

  # force push（-f 短縮形・+refspec 含む ── 撤去した旧版はここが素通しのドリフト版だった）
  if echo "$COMMAND" | grep -qE "git[[:space:]]+push\b" \
     && echo "$COMMAND" | grep -qE "(--force(-with-lease)?\b|[[:space:]]-[a-zA-Z]*f[a-zA-Z]*\b|[[:space:]]\+[^[:space:]]+)"; then
    echo '{"decision":"block","reason":"fail-safe: global guard (~/.claude/hooks/pre-bash-guard.py) not provisioned; force push blocked. Install the global harness layer or ask the user."}' >&2
    exit 2
  fi

  if echo "$COMMAND" | grep -qE "git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-f)"; then
    echo '{"decision":"block","reason":"fail-safe: global guard not provisioned; destructive git operation blocked. Ask the user first."}' >&2
    exit 2
  fi

  if echo "$COMMAND" | grep -qE "supabase[[:space:]]+db[[:space:]]+reset"; then
    echo '{"decision":"block","reason":"fail-safe: global guard not provisioned; supabase db reset can wipe production data. Ask the user first."}' >&2
    exit 2
  fi

  if echo "$COMMAND" | grep -qE "git[[:space:]]+add.*[[:space:]/]\.env(\.[^[:space:]]+)?([[:space:]]|$)"; then
    echo '{"decision":"block","reason":"fail-safe: global guard not provisioned; .env files must never be committed."}' >&2
    exit 2
  fi
fi

exit 0
