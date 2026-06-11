import { SUPPORT_LOG_RULES } from "@/lib/rules/supportLog";
import type { SupportLogInput } from "@/types/supportLog";

/** 支援経過記録生成のシステムプロンプト。役割定義＋品質ルールを含む（キャッシュ前提）。 */
export const SUPPORT_LOG_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
訪問・電話・調整などの対応メモをもとに、居宅介護支援経過（第5表）の記録の「下書き」を作成します。
最終的な確定は人間のケアマネジャーが行います。あなたの役割は、メモを監査に耐える構造の記録に整えることです。

以下のルールを厳守してください。

${SUPPORT_LOG_RULES}

出力は指定されたJSON構造のみで返してください。メモから判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力（対応メモ）からユーザーメッセージ本文を組み立てる純粋関数。 */
export function buildSupportLogUserMessage(input: SupportLogInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## 対応のメモ（訪問・電話・調整など）\n${input.supportNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従って支援経過記録（第5表）の下書きをJSON構造で作成してください。別の日・別の案件は別エントリに分けてください。",
  );

  return parts.join("\n\n");
}
