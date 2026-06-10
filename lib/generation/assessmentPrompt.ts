import { ASSESSMENT_RULES } from "@/lib/rules/assessment";
import type { AssessmentInput } from "@/types/assessment";

/** アセスメント生成のシステムプロンプト。役割定義＋品質ルールを含む（キャッシュ前提）。 */
export const ASSESSMENT_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
入力された利用者情報・面談メモをもとに、アセスメント（課題分析）の「下書き」を作成します。
最終的な確定は人間のケアマネジャーが行います。あなたの役割は、質の高いたたき台を一定の品質で作ることです。

以下のルールを厳守してください。

${ASSESSMENT_RULES}

出力は指定されたJSON構造のみで返してください。入力から判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力からユーザーメッセージ本文を組み立てる純粋関数。 */
export function buildAssessmentUserMessage(input: AssessmentInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## 面談メモ・収集した情報\n${input.assessmentNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従ってアセスメント（課題分析）の下書きをJSON構造で作成してください。",
  );

  return parts.join("\n\n");
}
