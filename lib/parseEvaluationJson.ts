import type { EvaluationResult } from "@/types/evaluation";

export type ParseEvaluationResult =
  | { ok: true; data: EvaluationResult }
  | { ok: false; reason: "no_json" | "invalid_json" | "invalid_shape" };

/**
 * LLM のテキスト応答から評価結果 JSON を抽出・検証する純粋関数。
 * ```json フェンスや前後の地の文が含まれていても、最初の `{` から最後の `}` までを取り出す。
 * 副作用がなくテストしやすいよう、API ルートから切り出している。
 */
export function parseEvaluationJson(text: string): ParseEvaluationResult {
  let jsonStr = text;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) jsonStr = fenced[1];
  jsonStr = jsonStr.trim();

  const start = jsonStr.indexOf("{");
  const end = jsonStr.lastIndexOf("}");
  if (start === -1 || end === -1) return { ok: false, reason: "no_json" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const candidate = parsed as Partial<EvaluationResult>;
  if (!Array.isArray(candidate.categories) || typeof candidate.total_score !== "number") {
    return { ok: false, reason: "invalid_shape" };
  }
  return { ok: true, data: parsed as EvaluationResult };
}
