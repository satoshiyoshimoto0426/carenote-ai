/**
 * 点検（PDF の AI 評価・app/api/evaluate/route.ts）で使うモデル名。
 *
 * なぜ別の定数か: lib/anthropic.ts の CLAUDE_MODEL（帳票の生成用・Opus 系）とは目的も費用も違うため、
 *   点検だけを黙って高い方に寄せない（2026-09-25 吉本さん決定「正しい名前に戻すだけ」）。
 * なぜ別名（日付なし）か: 2026-09-14 から本番の点検は、存在しない名前 `claude-sonnet-4-5-20250514` を送って
 *   API に弾かれ続けていた（Issue #4）。日付つきの名前は手で書くと間違えやすいので、公式一覧の別名だけを使う
 *   （正本= claude-api スキル shared/models.md「Claude Sonnet 4.5 / claude-sonnet-4-5 / Active」）。
 * なぜ route.ts の中に置かないか: Next.js は API の入口のファイルから GET/POST 等以外を export すると組み立てで落とす。
 * 何と繋がるか: tests/api/evaluate.route.test.ts（送る名前がこの定数で、日付つきでないことを固定）。
 */
export const EVALUATE_MODEL = "claude-sonnet-4-5";
