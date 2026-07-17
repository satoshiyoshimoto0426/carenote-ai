import { RESCUE_SYSTEM_OVERRIDE } from "@/lib/rules/rescue";
import type { MonitoringDraft, MonitoringInput } from "@/types/monitoring";
import { buildMonitoringUserMessage, MONITORING_SYSTEM_PROMPT } from "./monitoringPrompt";
import { type GenerateOptions, generateStructuredDraft } from "./structured";

/** 構造化出力(JSON Schema)。MonitoringDraft と一致させること。 */
const MONITORING_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    overallSummary: { type: "string" },
    goalEvaluations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          goal: { type: "string" },
          achievement: { type: "string" },
          evidence: { type: "string" },
          proposal: { type: "string" },
        },
        required: ["goal", "achievement", "evidence", "proposal"],
        additionalProperties: false,
      },
    },
    planRecommendation: { type: "string" },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: [
    "clientName",
    "overallSummary",
    "goalEvaluations",
    "planRecommendation",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/** 前回プラン＋最新状況から、ルールに従ったモニタリング記録の下書きを生成する。 */
export async function generateMonitoring(
  input: MonitoringInput,
  options: GenerateOptions = {},
): Promise<MonitoringDraft> {
  return generateStructuredDraft<MonitoringDraft>({
    systemPrompt: options.rescue
      ? `${MONITORING_SYSTEM_PROMPT}\n\n${RESCUE_SYSTEM_OVERRIDE}`
      : MONITORING_SYSTEM_PROMPT,
    userMessage: buildMonitoringUserMessage(input),
    schema: MONITORING_JSON_SCHEMA,
  });
}
