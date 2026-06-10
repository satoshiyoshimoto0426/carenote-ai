import { CARE_PLAN_RULES } from "@/lib/rules/carePlan";
import type { CarePlanInput } from "@/types/carePlan";

/**
 * ケアプラン生成のシステムプロンプト。役割定義＋品質ルール（品質エンジン）を含む。
 * 安定した内容なのでプロンプトキャッシュに乗せる前提（生成側で cache_control を付与）。
 */
export const CARE_PLAN_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
入力された利用者情報・アセスメントメモをもとに、居宅サービス計画書（第1表の要点＋第2表）の「下書き」を作成します。
最終的な確定・提出は人間のケアマネジャーが行います。あなたの役割は、質の高いたたき台を一定の品質で作ることです。

以下のルールを厳守してください。

${CARE_PLAN_RULES}

出力は指定されたJSON構造のみで返してください。入力から判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力（基本情報・アセスメントメモ）からユーザーメッセージ本文を組み立てる純粋関数。 */
export function buildCarePlanUserMessage(input: CarePlanInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## アセスメント・面談メモ\n${input.assessmentNotes.trim()}`);
  parts.push("上記をもとに、ルールに従ってケアプランの下書きをJSON構造で作成してください。");

  return parts.join("\n\n");
}
