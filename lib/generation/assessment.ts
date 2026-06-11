import type { AssessmentDraft, AssessmentInput } from "@/types/assessment";
import { ASSESSMENT_SYSTEM_PROMPT, buildAssessmentUserMessage } from "./assessmentPrompt";
import { generateStructuredDraft } from "./structured";

/** 課題分析標準項目（2023年改定）の課題分析14項目の正式名称。enumで出力を強制する。 */
export const ASSESSMENT_DOMAIN_NAMES = [
  "健康状態",
  "ADL",
  "IADL",
  "認知機能や判断能力",
  "コミュニケーションにおける理解と表出の状況",
  "生活リズム",
  "排泄の状況",
  "清潔の保持に関する状況",
  "口腔内の状況",
  "食事摂取の状況",
  "社会との関わり",
  "家族等の状況",
  "居住環境",
  "その他留意すべき事項・状況",
] as const;

/** 構造化出力(JSON Schema)。AssessmentDraft と一致させること。 */
const ASSESSMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    assessmentReason: { type: "string" },
    mainComplaints: { type: "string" },
    lifeHistory: { type: "string" },
    currentServices: { type: "string" },
    overview: { type: "string" },
    domains: {
      type: "array",
      items: {
        type: "object",
        properties: {
          domain: { type: "string", enum: [...ASSESSMENT_DOMAIN_NAMES] },
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
    "assessmentReason",
    "mainComplaints",
    "lifeHistory",
    "currentServices",
    "overview",
    "domains",
    "strengths",
    "identifiedIssues",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/** 面談メモ等の入力から、課題分析標準項目に準拠したアセスメント下書きを生成する。 */
export async function generateAssessment(input: AssessmentInput): Promise<AssessmentDraft> {
  return generateStructuredDraft<AssessmentDraft>({
    systemPrompt: ASSESSMENT_SYSTEM_PROMPT,
    userMessage: buildAssessmentUserMessage(input),
    schema: ASSESSMENT_JSON_SCHEMA,
  });
}
