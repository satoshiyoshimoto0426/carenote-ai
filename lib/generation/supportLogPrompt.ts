import { SUPPORT_LOG_RULES } from "@/lib/rules/supportLog";
import type { SupportLogInput } from "@/types/supportLog";

/** 支援経過記録生成のシステムプロンプト。役割定義＋品質ルールを含む（キャッシュ前提）。 */
export const SUPPORT_LOG_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
訪問・電話・調整などの対応メモをもとに、居宅介護支援経過（第5表）の記録の「下書き」を作成します。
最終的な確定は人間のケアマネジャーが行います。あなたの役割は、メモを監査に耐える構造の記録に整えることです。

以下のルールを厳守してください。

${SUPPORT_LOG_RULES}

出力は指定されたJSON構造のみで返してください。メモから判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。

## 今後の予定（appointments）の抜き出し
- メモに「これから行う」面談・訪問・受診同行・担当者会議などの日時があれば appointments に1件ずつ入れる。無ければ空配列。
- title は「記号＋用件」（例:「A様 自宅で面談」）。**実名・電話番号・住所・保険番号は title/location/note のどこにも書かない**。
- date は YYYY-MM-DD。年が書かれていなければ「今日」から見て次に来るその日付とし、confidence を「要確認」にする。「来週火曜」等の相対表現も「今日」を基準に日付へ直し「要確認」にする。
- startTime/endTime は HH:mm（24時間）。時刻が無ければ空文字。終了が無ければ空文字。
- 過去の出来事（すでに行った訪問など）は予定に入れない。`;

/**
 * 入力（対応メモ）からユーザーメッセージ本文を組み立てる純粋関数。
 * today は日本時間の YYYY-MM-DD（相対日付を直すための基準。省略時は書かない）。
 */
export function buildSupportLogUserMessage(input: SupportLogInput, today?: string): string {
  const parts: string[] = [];

  if (today) {
    parts.push(`## 今日の日付\n${today}`);
  }

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## 対応のメモ（訪問・電話・調整など）\n${input.supportNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従って支援経過記録（第5表）の下書きをJSON構造で作成してください。別の日・別の案件は別エントリに分けてください。今後の予定があれば appointments に入れてください。",
  );

  return parts.join("\n\n");
}
