import { MEETING_SUMMARY_RULES } from "@/lib/rules/meetingSummary";
import type { MeetingSummaryInput } from "@/types/meetingSummary";

/** 第4表生成のシステムプロンプト。役割定義＋品質ルールを含む（キャッシュ前提）。 */
export const MEETING_SUMMARY_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
サービス担当者会議のメモ・書き起こしをもとに、第4表（サービス担当者会議の要点）の「下書き」を作成します。
最終的な確定は人間のケアマネジャーが行います。あなたの役割は、会議の内容を正確に・漏れなく構造化することです。

以下のルールを厳守してください。

${MEETING_SUMMARY_RULES}

出力は指定されたJSON構造のみで返してください。メモから判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力（会議メモ）からユーザーメッセージ本文を組み立てる純粋関数。 */
export function buildMeetingSummaryUserMessage(input: MeetingSummaryInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## サービス担当者会議のメモ\n${input.meetingNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従って第4表（サービス担当者会議の要点）の下書きをJSON構造で作成してください。",
  );

  return parts.join("\n\n");
}
