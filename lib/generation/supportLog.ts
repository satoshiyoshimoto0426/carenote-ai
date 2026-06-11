import type { SupportLogDraft, SupportLogInput } from "@/types/supportLog";
import { generateStructuredDraft } from "./structured";
import { buildSupportLogUserMessage, SUPPORT_LOG_SYSTEM_PROMPT } from "./supportLogPrompt";

/** 構造化出力(JSON Schema)。SupportLogDraft と一致させること。 */
const SUPPORT_LOG_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          date: { type: "string" },
          category: { type: "string" },
          action: { type: "string" },
          background: { type: "string" },
          factsAndStatements: { type: "string" },
          judgement: { type: "string" },
          nextAction: { type: "string" },
        },
        required: [
          "date",
          "category",
          "action",
          "background",
          "factsAndStatements",
          "judgement",
          "nextAction",
        ],
        additionalProperties: false,
      },
    },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: ["clientName", "entries", "itemsToConfirm"],
  additionalProperties: false,
};

/** 対応メモから、支援経過記録（第5表）の下書きを生成する。 */
export async function generateSupportLog(input: SupportLogInput): Promise<SupportLogDraft> {
  return generateStructuredDraft<SupportLogDraft>({
    systemPrompt: SUPPORT_LOG_SYSTEM_PROMPT,
    userMessage: buildSupportLogUserMessage(input),
    schema: SUPPORT_LOG_JSON_SCHEMA,
  });
}
