import { describe, expect, it } from "vitest";
import { buildSupportLogUserMessage, SUPPORT_LOG_SYSTEM_PROMPT } from "./supportLogPrompt";

describe("支援経過: 予定（appointments）の抜き出し指示", () => {
  it("システムプロンプトに予定の抜き出しと個人情報の禁止が書かれている", () => {
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain("appointments");
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain("実名・電話番号・住所");
    expect(SUPPORT_LOG_SYSTEM_PROMPT).toContain("過去の出来事");
  });

  it("今日の日付を渡すと本文の先頭に入り、渡さなければ入らない", () => {
    const withToday = buildSupportLogUserMessage({ supportNotes: "メモ" }, "2026-09-09");
    expect(withToday.startsWith("## 今日の日付\n2026-09-09")).toBe(true);
    const without = buildSupportLogUserMessage({ supportNotes: "メモ" });
    expect(without).not.toContain("今日の日付");
  });
});
