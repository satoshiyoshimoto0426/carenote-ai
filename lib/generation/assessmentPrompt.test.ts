import { describe, expect, it } from "vitest";
import { ASSESSMENT_RULES } from "@/lib/rules/assessment";
import { ASSESSMENT_SYSTEM_PROMPT, buildAssessmentUserMessage } from "./assessmentPrompt";

describe("ASSESSMENT_SYSTEM_PROMPT", () => {
  it("品質ルールを注入している", () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).toContain(ASSESSMENT_RULES);
  });

  it("ハルシネーション抑止(要確認)の指示を含む", () => {
    expect(ASSESSMENT_SYSTEM_PROMPT).toContain("要確認");
    expect(ASSESSMENT_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });
});

describe("buildAssessmentUserMessage", () => {
  it("面談メモを本文に含める", () => {
    const msg = buildAssessmentUserMessage({ assessmentNotes: "入浴に一部介助が必要" });
    expect(msg).toContain("入浴に一部介助が必要");
    expect(msg).toContain("面談メモ・収集した情報");
  });

  it("基本情報があれば見出し付きで含める", () => {
    const msg = buildAssessmentUserMessage({
      clientInfo: "78歳 男性 要介護1",
      assessmentNotes: "メモ",
    });
    expect(msg).toContain("## 利用者の基本情報");
    expect(msg).toContain("78歳 男性 要介護1");
  });

  it("基本情報が空白のみなら見出しを出さない", () => {
    const msg = buildAssessmentUserMessage({ clientInfo: "  ", assessmentNotes: "メモ" });
    expect(msg).not.toContain("## 利用者の基本情報");
  });
});
