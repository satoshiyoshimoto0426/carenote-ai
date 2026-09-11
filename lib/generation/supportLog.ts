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
    // 第4段: メモ中の「これから」の予定（カレンダー登録用）。実名・番号・住所は入れない
    appointments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          location: { type: "string" },
          note: { type: "string" },
          confidence: { type: "string", enum: ["確定", "要確認"] },
        },
        required: ["title", "date", "startTime", "endTime", "location", "note", "confidence"],
        additionalProperties: false,
      },
    },
    // 第5段: 状態像の変化 → アセスメント欄への「追記」案（既存文章は書き換えない）
    assessmentUpdates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string", enum: ["mainComplaints", "lifeHistory", "overview"] },
          text: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "string", enum: ["確定", "要確認"] },
        },
        required: ["field", "text", "reason", "confidence"],
        additionalProperties: false,
      },
    },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: ["clientName", "entries", "appointments", "assessmentUpdates", "itemsToConfirm"],
  additionalProperties: false,
};

/** 日本時間の今日を YYYY-MM-DD で返す（サーバのタイムゾーンに依存しない）。 */
function todayInJapan(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

/** 対応メモから、支援経過記録（第5表）の下書きを生成する。 */
export async function generateSupportLog(
  input: SupportLogInput,
  options: GenerateOptions = {},
): Promise<SupportLogDraft> {
  return generateStructuredDraft<SupportLogDraft>({
    systemPrompt: options.rescue
      ? `${SUPPORT_LOG_SYSTEM_PROMPT}\n\n${RESCUE_SYSTEM_OVERRIDE}`
      : SUPPORT_LOG_SYSTEM_PROMPT,
    // 「来週火曜」等を日付に直すため、日本時間の今日を渡す
    userMessage: buildSupportLogUserMessage(input, todayInJapan()),
    schema: SUPPORT_LOG_JSON_SCHEMA,
  });
}
