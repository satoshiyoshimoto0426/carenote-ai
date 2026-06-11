import { describe, expect, it } from "vitest";
import { MEETING_SUMMARY_RULES } from "@/lib/rules/meetingSummary";
import {
  buildMeetingSummaryUserMessage,
  MEETING_SUMMARY_SYSTEM_PROMPT,
} from "./meetingSummaryPrompt";

describe("MEETING_SUMMARY_SYSTEM_PROMPT", () => {
  it("品質ルールを注入している", () => {
    expect(MEETING_SUMMARY_SYSTEM_PROMPT).toContain(MEETING_SUMMARY_RULES);
  });

  it("ハルシネーション抑止(要確認)の指示を含む", () => {
    expect(MEETING_SUMMARY_SYSTEM_PROMPT).toContain("要確認");
    expect(MEETING_SUMMARY_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });
});

describe("buildMeetingSummaryUserMessage", () => {
  it("会議メモを本文に含める", () => {
    const msg = buildMeetingSummaryUserMessage({
      meetingNotes: "通所リハ職員より下肢筋力は改善傾向との報告",
    });
    expect(msg).toContain("サービス担当者会議のメモ");
    expect(msg).toContain("下肢筋力は改善傾向");
  });

  it("基本情報があれば見出し付きで含める", () => {
    const msg = buildMeetingSummaryUserMessage({
      clientInfo: "82歳 女性 要介護2",
      meetingNotes: "メモ",
    });
    expect(msg).toContain("## 利用者の基本情報");
    expect(msg).toContain("82歳 女性 要介護2");
  });

  it("基本情報が空白のみなら見出しを出さない", () => {
    const msg = buildMeetingSummaryUserMessage({ clientInfo: " ", meetingNotes: "メモ" });
    expect(msg).not.toContain("## 利用者の基本情報");
  });
});
