import { describe, expect, it } from "vitest";
import { SUPPORT_LOG_RULES } from "@/lib/rules/supportLog";
import { buildSupportLogUserMessage, SUPPORT_LOG_SYSTEM_PROMPT } from "./supportLogPrompt";

describe("SUPPORT_LOG_SYSTEM_PROMPT", () => {
  it("品質ルールを注入している", () => {
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain(SUPPORT_LOG_RULES);
  });

  it("ハルシネーション抑止(要確認)の指示を含む", () => {
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain("要確認");
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });
});

describe("buildSupportLogUserMessage", () => {
  it("対応メモを本文に含める", () => {
    const msg = buildSupportLogUserMessage({ supportNotes: "長女から電話。夜眠れていない様子" });
    expect(msg).toContain("対応のメモ");
    expect(msg).toContain("夜眠れていない様子");
  });

  it("別エントリ分割の指示を含む", () => {
    const msg = buildSupportLogUserMessage({ supportNotes: "メモ" });
    expect(msg).toContain("別エントリ");
  });

  it("基本情報があれば見出し付きで含める", () => {
    const msg = buildSupportLogUserMessage({ clientInfo: "82歳 女性", supportNotes: "メモ" });
    expect(msg).toContain("## 利用者の基本情報");
  });
});
