import { RESCUE_SYSTEM_OVERRIDE } from "@/lib/rules/rescue";
import type { SupportLogDraft, SupportLogInput } from "@/types/supportLog";
import { type GenerateOptions, generateStructuredDraft } from "./structured";
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
export async function generateSupportLog(
  input: SupportLogInput,
  options: GenerateOptions = {},
): Promise<SupportLogDraft> {
  return generateStructuredDraft<SupportLogDraft>({
    systemPrompt: options.rescue
      ? `${SUPPORT_LOG_SYSTEM_PROMPT}\n\n${RESCUE_SYSTEM_OVERRIDE}`
      : SUPPORT_LOG_SYSTEM_PROMPT,
    userMessage: buildSupportLogUserMessage(input),
    schema: SUPPORT_LOG_JSON_SCHEMA,
  });
}
