import type { CarePlanDraft, CarePlanInput } from "@/types/carePlan";
import { buildCarePlanUserMessage, CARE_PLAN_SYSTEM_PROMPT } from "./carePlanPrompt";
import { generateStructuredDraft } from "./structured";

/** 構造化出力(JSON Schema)。CarePlanDraft と一致させること。 */
const CARE_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    intentions: { type: "string" },
    assessmentSummary: { type: "string" },
    comprehensivePolicy: { type: "string" },
    needs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          need: { type: "string" },
          longTermGoal: { type: "string" },
          longTermPeriod: { type: "string" },
          shortTermGoal: { type: "string" },
          shortTermPeriod: { type: "string" },
          services: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                serviceType: { type: "string" },
                frequency: { type: "string" },
                period: { type: "string" },
                provider: { type: "string" },
              },
              required: ["content", "serviceType", "frequency", "period", "provider"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "need",
          "longTermGoal",
          "longTermPeriod",
          "shortTermGoal",
          "shortTermPeriod",
          "services",
        ],
        additionalProperties: false,
      },
    },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: [
    "clientName",
    "intentions",
    "assessmentSummary",
    "comprehensivePolicy",
    "needs",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/**
 * アセスメントメモ等の入力から、ルールに従ったケアプラン下書き(第1・2表)を生成する。
 */
export async function generateCarePlan(input: CarePlanInput): Promise<CarePlanDraft> {
  return generateStructuredDraft<CarePlanDraft>({
    systemPrompt: CARE_PLAN_SYSTEM_PROMPT,
    userMessage: buildCarePlanUserMessage(input),
    schema: CARE_PLAN_JSON_SCHEMA,
  });
}
