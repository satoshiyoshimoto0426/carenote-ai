import { describe, expect, it } from "vitest";
import { MONITORING_RULES } from "@/lib/rules/monitoring";
import { buildMonitoringUserMessage, MONITORING_SYSTEM_PROMPT } from "./monitoringPrompt";

describe("MONITORING_SYSTEM_PROMPT", () => {
  it("品質ルールを注入している", () => {
    expect(MONITORING_SYSTEM_PROMPT).toContain(MONITORING_RULES);
  });

  it("ハルシネーション抑止(要確認)の指示を含む", () => {
    expect(MONITORING_SYSTEM_PROMPT).toContain("要確認");
    expect(MONITORING_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });
});

describe("buildMonitoringUserMessage", () => {
  const base = {
    previousPlanSummary: "短期目標: 伝い歩きで日中トイレに行ける（3か月）",
    monitoringNotes: "日中のトイレは概ね自立。夜間は不安が残る。",
  };

  it("前回プランと最新状況の両方を本文に含める", () => {
    const msg = buildMonitoringUserMessage(base);
    expect(msg).toContain("前回のケアプラン");
    expect(msg).toContain("伝い歩きで日中トイレに行ける");
    expect(msg).toContain("最新の状況");
    expect(msg).toContain("夜間は不安が残る");
  });

  it("目標ごとの評価を指示している", () => {
    const msg = buildMonitoringUserMessage(base);
    expect(msg).toContain("目標ごと");
  });

  it("基本情報があれば見出し付きで含める", () => {
    const msg = buildMonitoringUserMessage({ ...base, clientInfo: "82歳 女性 要介護2" });
    expect(msg).toContain("## 利用者の基本情報");
    expect(msg).toContain("82歳 女性 要介護2");
  });
});
