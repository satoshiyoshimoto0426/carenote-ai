#!/usr/bin/env bash
# PreToolUse: 危険操作をブロック（carenote-ai）

INPUT=$(cat 2>/dev/null || true)
TOOL_NAME=$(echo "$INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('tool_name',''))" 2>/dev/null || true)
TOOL_INPUT=$(echo "$INPUT" | python -c "import sys,json; print(json.dumps(json.load(sys.stdin).get('tool_input',{})))" 2>/dev/null || echo "{}")

if [[ "$TOOL_NAME" == "Bash" ]]; then
  COMMAND=$(echo "$TOOL_INPUT" | python -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || true)

  # force push 禁止
  if echo "$COMMAND" | grep -qE "git[[:space:]]+push[[:space:]]+.*--force"; then
    echo '{"decision":"block","reason":"git push --force is blocked. ask user first."}' >&2
    exit 2
  fi

  # 破壊的 git 操作
  if echo "$COMMAND" | grep -qE "git[[:space:]]+(reset[[:space:]]+--hard|clean[[:space:]]+-f)"; then
    echo '{"decision":"block","reason":"Destructive git operation. ask user first."}' >&2
    exit 2
  fi

  # Supabase 本番 reset 禁止
  if echo "$COMMAND" | grep -qE "supabase[[:space:]]+db[[:space:]]+reset"; then
    echo '{"decision":"block","reason":"supabase db reset can wipe production data. ask user first."}' >&2
    exit 2
  fi

  # .env のコミット禁止
  if echo "$COMMAND" | grep -qE "git[[:space:]]+add[[:space:]]+.*\.env(\.|$)"; then
    echo '{"decision":"block","reason":".env files must never be committed."}' >&2
    exit 2
  fi
fi

exit 0
