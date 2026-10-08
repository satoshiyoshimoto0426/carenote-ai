import type { SupportPlanADraft, SupportPlanAInput } from "@/types/supportPlanA";
import { generateStructuredDraft } from "./structured";
import { buildSupportPlanAUserMessage, SUPPORT_PLAN_A_SYSTEM_PROMPT } from "./supportPlanAPrompt";

const str = { type: "string" } as const;

/** 文字の欄だけの object（全項目必須・余分な項目なし） */
function strings(keys: readonly string[]) {
  return {
    type: "object",
    properties: Object.fromEntries(keys.map((k) => [k, str])),
    required: [...keys],
    additionalProperties: false,
  };
}

const NEED = strings(["issue", "direction"]);
const LIAISON = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["あり", "なし", "要確認"] },
    name: str,
    content: str,
  },
  required: ["status", "name", "content"],
  additionalProperties: false,
};

/**
 * 構造化出力（JSON Schema）。types/supportPlanA.ts の SupportPlanADraft と一致させる。
 * 一致はテスト（lib/generation/supportPlanA.test.ts）が、型の欄の名前と突き合わせて固定する。
 */
export const SUPPORT_PLAN_A_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: str,
    basic: strings([
      "age",
      "sex",
      "disabilityType",
      "handbook",
      "contractType",
      "admissionDate",
      "attendanceHistory",
      "workDays",
      "workHours",
      "hourlyWage",
      "monthlyWage",
    ]),
    intentions: strings(["work", "life", "other", "family"]),
    needs: {
      type: "object",
      properties: {
        work: { type: "array", items: NEED },
        social: { type: "array", items: NEED },
        health: { type: "array", items: NEED },
      },
      required: ["work", "social", "health"],
      additionalProperties: false,
    },
    policy: str,
    longTerm: strings(["goal", "target", "rationale"]),
    shortTerms: {
      type: "array",
      items: strings(["title", "detail", "support", "method", "staffRole"]),
    },
    service: strings(["content", "otherStaff", "workCare", "healthCare", "envCare"]),
    liaison: {
      type: "object",
      properties: { counselor: LIAISON, medical: LIAISON, family: LIAISON, others: str },
      required: ["counselor", "medical", "family", "others"],
      additionalProperties: false,
    },
    reviewCriteria: str,
    itemsToConfirm: { type: "array", items: str },
  },
  required: [
    "clientName",
    "basic",
    "intentions",
    "needs",
    "policy",
    "longTerm",
    "shortTerms",
    "service",
    "liaison",
    "reviewCriteria",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/**
 * 面談の文字起こしから、就労A型の個別支援計画書の原案を作る。
 * 呼ぶ所: lib/generation/dispatch.ts（documentType "supportPlanA"）。救済モードの上書きは使わない
 * （この書類は「話に出なかった所は要記入」が決まりで、完成形まで埋める救済モードとは考え方が逆のため）。
 */
export async function generateSupportPlanA(input: SupportPlanAInput): Promise<SupportPlanADraft> {
  return generateStructuredDraft<SupportPlanADraft>({
    systemPrompt: SUPPORT_PLAN_A_SYSTEM_PROMPT,
    userMessage: buildSupportPlanAUserMessage(input),
    schema: SUPPORT_PLAN_A_JSON_SCHEMA,
  });
}
