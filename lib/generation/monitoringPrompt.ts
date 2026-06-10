import { MONITORING_RULES } from "@/lib/rules/monitoring";
import type { MonitoringInput } from "@/types/monitoring";

/** モニタリング生成のシステムプロンプト。役割定義＋品質ルールを含む（キャッシュ前提）。 */
export const MONITORING_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
前回のケアプラン（目標・サービス）と最新の状況をもとに、モニタリング記録の「下書き」を作成します。
最終的な確定は人間のケアマネジャーが行います。あなたの役割は、質の高いたたき台を一定の品質で作ることです。

以下のルールを厳守してください。

${MONITORING_RULES}

出力は指定されたJSON構造のみで返してください。入力から判断できない事項は創作せず、itemsToConfirm に「要確認」として具体的に列挙してください。`;

/** 入力（前回プラン＋最新状況）からユーザーメッセージ本文を組み立てる純粋関数。 */
export function buildMonitoringUserMessage(input: MonitoringInput): string {
  const parts: string[] = [];

  const clientInfo = input.clientInfo?.trim();
  if (clientInfo) {
    parts.push(`## 利用者の基本情報\n${clientInfo}`);
  }

  parts.push(`## 前回のケアプラン（目標・サービスの要約）\n${input.previousPlanSummary.trim()}`);
  parts.push(`## 最新の状況・モニタリングで得た情報\n${input.monitoringNotes.trim()}`);
  parts.push(
    "上記をもとに、ルールに従って前回プランの目標ごとに達成状況を評価し、モニタリング記録の下書きをJSON構造で作成してください。",
  );

  return parts.join("\n\n");
}
