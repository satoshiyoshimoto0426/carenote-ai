import { SUPPORT_PLAN_A_RULES } from "@/lib/rules/supportPlanA";
import type { SupportPlanAInput } from "@/types/supportPlanA";

/**
 * 就労A型の個別支援計画書（原案）を作る AI への指示（役割＋品質ルール。キャッシュに乗せる安定部分）。
 * 呼ぶ所: lib/generation/supportPlanA.ts。ケアマネ向けの指示とは役割の1行から別にしている。
 */
export const SUPPORT_PLAN_A_SYSTEM_PROMPT = `あなたは就労継続支援A型事業所のサービス管理責任者（サビ管）を補助するAIです。
利用者とのアセスメント面談の文字起こしをもとに、個別支援計画書の「原案」を作成します。
最終的な判断・修正・承認はサビ管が行います。あなたの役割は、面談で話されたことを、様式の章に沿って正確に整理することです。

以下のルールを厳守してください。

${SUPPORT_PLAN_A_RULES}

出力は指定されたJSON構造のみで返してください。面談から判断できない事項は創作せず空文字にし、確かめてほしい点は itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力（名簿の基本情報と面談の文字起こし）から、AI に渡す本文を組み立てる純粋関数。 */
export function buildSupportPlanAUserMessage(input: SupportPlanAInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報（名簿から）\n${clientInfo}`);
  }

  parts.push(`## アセスメント面談の文字起こし・メモ\n${input.interviewNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従って個別支援計画書（就労継続支援A型）の原案をJSON構造で作成してください。話に出なかった欄は空文字にしてください。",
  );

  return parts.join("\n\n");
}
