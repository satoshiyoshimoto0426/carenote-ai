import type { AssessmentDraft, AssessmentInput } from "@/types/assessment";
import { ASSESSMENT_SYSTEM_PROMPT, buildAssessmentUserMessage } from "./assessmentPrompt";
import { generateStructuredDraft } from "./structured";

/** 構造化出力(JSON Schema)。AssessmentDraft と一致させること。 */
const ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    overview: { type: "string" },
    domains: {
      type: "array",
      items: {
        type: "object",
        properties: {
          domain: { type: "string" },
          currentStatus: { type: "string" },
          analysis: { type: "string" },
        },
        required: ["domain", "currentStatus", "analysis"],
        additionalProperties: false,
      },
    },
    strengths: { type: "array", items: { type: "string" } },
    identifiedIssues: { type: "array", items: { type: "string" } },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: [
    "clientName",
    "overview",
    "domains",
    "strengths",
    "identifiedIssues",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/** 面談メモ等の入力から、ルールに従ったアセスメント（課題分析）の下書きを生成する。 */
export async function generateAssessment(input: AssessmentInput): Promise<AssessmentDraft> {
  return generateStructuredDraft<AssessmentDraft>({
    systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
    userMessage: buildAssessmentUserMessage(input),
    schema: ASSESSMENT_JSON_SCHEMA,
  });
}
