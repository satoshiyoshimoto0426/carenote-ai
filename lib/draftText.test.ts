import { describe, expect, it } from "vitest";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MonitoringDraft } from "@/types/monitoring";
import { assessmentToText, carePlanToText, monitoringToText } from "./draftText";

const carePlan: CarePlanDraft = {
  clientName: "山田花子",
  intentions: "自宅での生活を続けたい",
  assessmentSummary: "骨折後の歩行不安定により外出が減っており、移動の安定と交流機会の支援が必要",
  comprehensivePolicy: "転倒予防と外出機会の確保を支援する",
  needs: [
    {
      need: "また友人とお茶会に行きたい",
      longTermGoal: "友人宅まで一人で外出できる",
      longTermPeriod: "6か月",
      shortTermGoal: "伝い歩きで屋内を安全に移動できる",
      shortTermPeriod: "3か月",
      services: [
        { content: "歩行訓練", serviceType: "通所リハビリ", frequency: "週2回", period: "3か月" },
      ],
    },
  ],
  itemsToConfirm: ["夜間のトイレ状況"],
};

const assessment: AssessmentDraft = {
  clientName: "山田花子",
  overview: "骨折後の活動量低下が見られる",
  domains: [
    { domain: "ADL", currentStatus: "屋内は伝い歩き", analysis: "骨折後の筋力低下と転倒不安" },
  ],
  strengths: ["リハビリへの意欲がある"],
  identifiedIssues: ["外出機会の減少による閉じこもり傾向"],
  itemsToConfirm: ["服薬状況"],
};

const monitoring: MonitoringDraft = {
  clientName: "山田花子",
  overallSummary: "屋内移動は改善傾向",
  goalEvaluations: [
    {
      goal: "伝い歩きで屋内を安全に移動できる",
      achievement: "一部達成（改善傾向）",
      evidence: "日中のトイレ移動が自立した",
      proposal: "目標を継続し夜間の安全確保を追加検討",
    },
  ],
  planRecommendation: "継続（夜間対応のみ一部見直し）",
  itemsToConfirm: ["夫の腰痛の状況"],
};

describe("carePlanToText", () => {
  it("意向・方針・ニーズ・要確認を含む", () => {
    const text = carePlanToText(carePlan);
    expect(text).toContain("【利用者及び家族の意向】");
    expect(text).toContain("自宅での生活を続けたい");
    expect(text).toContain("【意向を踏まえた課題分析の結果】");
    expect(text).toContain("移動の安定と交流機会の支援が必要");
    expect(text).toContain("1. また友人とお茶会に行きたい");
    expect(text).toContain("長期目標: 友人宅まで一人で外出できる（6か月）");
    expect(text).toContain("歩行訓練 / 通所リハビリ / 週2回 / 3か月");
    expect(text).toContain("【要確認事項】");
    expect(text).toContain("・夜間のトイレ状況");
  });
});

describe("assessmentToText", () => {
  it("全体像・領域・強み・課題候補・要確認を含む", () => {
    const text = assessmentToText(assessment);
    expect(text).toContain("【全体像】");
    expect(text).toContain("■ ADL");
    expect(text).toContain("現状: 屋内は伝い歩き");
    expect(text).toContain("【強み（ストレングス）】");
    expect(text).toContain("1. 外出機会の減少による閉じこもり傾向");
    expect(text).toContain("・服薬状況");
  });

  it("強みが空なら見出しを出さない", () => {
    const text = assessmentToText({ ...assessment, strengths: [] });
    expect(text).not.toContain("【強み（ストレングス）】");
  });
});

describe("monitoringToText", () => {
  it("総合所見・目標評価・プラン判断・要確認を含む", () => {
    const text = monitoringToText(monitoring);
    expect(text).toContain("【総合所見】");
    expect(text).toContain("1. 伝い歩きで屋内を安全に移動できる");
    expect(text).toContain("達成状況: 一部達成（改善傾向）");
    expect(text).toContain("【プラン全体の判断】");
    expect(text).toContain("継続（夜間対応のみ一部見直し）");
    expect(text).toContain("・夫の腰痛の状況");
  });

  it("要確認が空ならブロックを出さない", () => {
    const text = monitoringToText({ ...monitoring, itemsToConfirm: [] });
    expect(text).not.toContain("【要確認事項】");
  });
});
