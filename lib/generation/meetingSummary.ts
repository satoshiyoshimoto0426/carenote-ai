import { RESCUE_SYSTEM_OVERRIDE } from "@/lib/rules/rescue";
import type { MeetingSummaryDraft, MeetingSummaryInput } from "@/types/meetingSummary";
import {
  buildMeetingSummaryUserMessage,
  MEETING_SUMMARY_SYSTEM_PROMPT,
} from "./meetingSummaryPrompt";
import { type GenerateOptions, generateStructuredDraft } from "./structured";

/** 構造化出力(JSON Schema)。MeetingSummaryDraft と一致させること。 */
const MEETING_SUMMARY_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    meetingDate: { type: "string" },
    meetingPlace: { type: "string" },
    meetingTime: { type: "string" },
    attendees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          affiliation: { type: "string" },
          role: { type: "string" },
          name: { type: "string" },
        },
        required: ["affiliation", "role", "name"],
        additionalProperties: false,
      },
    },
    discussions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          details: { type: "string" },
        },
        required: ["item", "details"],
        additionalProperties: false,
      },
    },
    conclusion: { type: "string" },
    remainingIssues: { type: "string" },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: [
    "clientName",
    "meetingDate",
    "meetingPlace",
    "meetingTime",
    "attendees",
    "discussions",
    "conclusion",
    "remainingIssues",
    "itemsToConfirm",
  ],
  additionalProperties: false,
};

/** 会議メモから、第4表（サービス担当者会議の要点）の下書きを生成する。 */
export async function generateMeetingSummary(
  input: MeetingSummaryInput,
  options: GenerateOptions = {},
): Promise<MeetingSummaryDraft> {
  return generateStructuredDraft<MeetingSummaryDraft>({
    systemPrompt: options.rescue
      ? `${MEETING_SUMMARY_SYSTEM_PROMPT}\n\n${RESCUE_SYSTEM_OVERRIDE}`
      : MEETING_SUMMARY_SYSTEM_PROMPT,
    userMessage: buildMeetingSummaryUserMessage(input),
    schema: MEETING_SUMMARY_JSON_SCHEMA,
  });
}
