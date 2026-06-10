import { describe, expect, it } from "vitest";
import { CARE_PLAN_RULES } from "@/lib/rules/carePlan";
import { buildCarePlanUserMessage, CARE_PLAN_SYSTEM_PROMPT } from "./carePlanPrompt";

describe("CARE_PLAN_SYSTEM_PROMPT", () => {
  it("品質ルール(品質エンジン)を注入している", () => {
    expect(CARE_PLAN_SYSTEM_PROMPT).toContain(CARE_PLAN_RULES);
  });

  it("ハルシネーション抑止(要確認)の指示を含む", () => {
    expect(CARE_PLAN_SYSTEM_PROMPT).toContain("要確認");
    expect(CARE_PLAN_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });
});

describe("buildCarePlanUserMessage", () => {
  it("アセスメントメモを本文に含める", () => {
    const msg = buildCarePlanUserMessage({ assessmentNotes: "歩行が不安定で外出を控えている" });
    expect(msg).toContain("歩行が不安定で外出を控えている");
    expect(msg).toContain("アセスメント・面談メモ");
  });

  it("基本情報があれば見出し付きで含める", () => {
    const msg = buildCarePlanUserMessage({
      clientInfo: "85歳 要介護2",
      assessmentNotes: "メモ本文",
    });
    expect(msg).toContain("## 利用者の基本情報");
    expect(msg).toContain("85歳 要介護2");
  });

  it("基本情報が無ければ基本情報の見出しを出さない", () => {
    const msg = buildCarePlanUserMessage({ assessmentNotes: "メモ本文" });
    expect(msg).not.toContain("## 利用者の基本情報");
  });

  it("前後の空白をトリムする", () => {
    const msg = buildCarePlanUserMessage({
      clientInfo: "  ",
      assessmentNotes: "  メモ  ",
    });
    // 空白のみの基本情報は省略される
    expect(msg).not.toContain("## 利用者の基本情報");
    expect(msg).toContain("## アセスメント・面談メモ\nメモ");
  });
});
