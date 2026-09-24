import type { EvaluationRecord, EvaluationResult } from "@/types/evaluation";
import { dbAccessError, dbFailedMessage } from "./db/errors";
import { createServerClient } from "./supabase/server";

/**
 * 点検（PDF の評価）の結果の保存と履歴（evaluations 表）。サーバ専用。
 * 保存は app/api/evaluate/route.ts、履歴は app/api/history/route.ts → ダッシュボード（app/(dashboard)/dashboard）。
 * DB の失敗は「履歴が0件」と分ける（lib/db/errors.ts・2026-09-24 検収の指摘）。
 */

/** 評価の履歴を DB から読めなかったとき、職員に見せる文（GET /api/history が 503 で返す）。 */
export const EVALUATIONS_LOAD_FAILED_MESSAGE = dbFailedMessage(
  "評価の履歴を読み込めませんでした。",
);

/**
 * 評価の結果を1件保存する（本人の user_id で）。
 * @returns 保存した行の id。書けなければ null（「保存に失敗」だけを表す。失敗はここでサーバのログに残す）。
 */
export async function saveEvaluation(params: {
  userId: string;
  clientName: string;
  fileName: string;
  totalScore: number;
  result: EvaluationResult;
}): Promise<string | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("evaluations")
    .insert({
      user_id: params.userId,
      client_name: params.clientName,
      file_name: params.fileName,
      total_score: params.totalScore,
      result: params.result,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[db] saveEvaluation error:", error?.message ?? "no data");
    return null;
  }
  return data.id as string;
}

/**
 * 本人の評価の履歴（新しい順・最大100件）。0件なら []。
 * @throws DbAccessError DB を読めなかったとき（以前は [] を返し、ダッシュボードが「評価 0件」に見せていた）。
 */
export async function getEvaluations(userId: string): Promise<EvaluationRecord[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("evaluations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw dbAccessError("getEvaluations", error, EVALUATIONS_LOAD_FAILED_MESSAGE);
  return (data ?? []) as EvaluationRecord[];
}
