import type { MeetingSummaryDraft, MeetingSummaryInput } from "@/types/meetingSummary";
import {
  buildMeetingSummaryUserMessage,
  MEETING_SUMMARY_SYSTEM_PROMPT,
} from "./meetingSummaryPrompt";
import { generateStructuredDraft } from "./structured";

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
): Promise<MeetingSummaryDraft> {
  return generateStructuredDraft<MeetingSummaryDraft>({
    systemPrompt: MEETING_SUMMARY_SYSTEM_PROMPT,
    userMessage: buildMeetingSummaryUserMessage(input),
    schema: MEETING_SUMMARY_JSON_SCHEMA,
  });
}
