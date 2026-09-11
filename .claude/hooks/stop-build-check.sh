#!/usr/bin/env bash
# Stop: TypeScript の型チェックと Biome チェックを実行
# Claude の応答終了前に、コードがまだ壊れていないかを確認する

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ERRORS=""

# 型チェック
if [[ -f "$PROJECT_ROOT/tsconfig.json" ]]; then
  TSC_OUTPUT=$(cd "$PROJECT_ROOT" && npx --no-install tsc --noEmit 2>&1) || {
    ERRORS+=$'\n[TypeScript Error]\n'"$TSC_OUTPUT"
  }
fi

# Biome チェック（フォーマット崩れも検出）
if [[ -f "$PROJECT_ROOT/biome.json" ]]; then
  BIOME_OUTPUT=$(cd "$PROJECT_ROOT" && npx --no-install biome check . 2>&1) || {
    ERRORS+=$'\n[Biome Check Failed]\n'"$BIOME_OUTPUT"
  }
fi

# 見えない文字（NUL・ゼロ幅）の混入（独立審査 2026-09-11: git がバイナリ扱いし差分がレビューに届かない）
if [[ -f "$PROJECT_ROOT/tools/check-invisible.mjs" ]]; then
  INVISIBLE_OUTPUT=$(cd "$PROJECT_ROOT" && node tools/check-invisible.mjs 2>&1) || {
    ERRORS+=$'
[Invisible characters (NUL / zero-width) in source]
'"$INVISIBLE_OUTPUT"
  }
fi

if [[ -n "$ERRORS" ]]; then
  printf '🛑 Quality gates failed before stopping. Please fix:\n%s\n' "$ERRORS" >&2
  exit 1
fi

exit 0
