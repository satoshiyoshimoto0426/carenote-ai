import { createServerClient } from "./supabase/server";
import { EvaluationRecord, EvaluationResult } from "@/types/evaluation";

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

  if (error) {
    console.error("[db] saveEvaluation error:", error.message);
    return null;
  }
  return data.id as string;
}

export async function getEvaluations(userId: string): Promise<EvaluationRecord[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("evaluations")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[db] getEvaluations error:", error.message);
    return [];
  }
  return data as EvaluationRecord[];
}

export async function getEvaluationById(
  id: string,
  userId: string
): Promise<EvaluationRecord | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("evaluations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) return null;
  return data as EvaluationRecord;
}
