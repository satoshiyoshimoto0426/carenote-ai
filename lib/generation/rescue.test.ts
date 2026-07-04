import { describe, expect, it } from "vitest";
import { carePlanToText } from "@/lib/draftText";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import {
  buildCarePlanNotes,
  buildMeetingNotes,
  buildMonitoringNotes,
  buildPreviousPlanSummary,
  buildSupportNotes,
  composePersonaNotes,
} from "./rescue";

const assessment: AssessmentDraft = {
  clientName: "利用者",
  assessmentReason: "初回",
  mainComplaints: "本人: 自宅で暮らし続けたい。",
  lifeHistory: "長年自営業を営んでいた。",
  currentServices: "通所介護を週2回利用。",
  overview: "ADL低下があるが在宅継続の意欲が高い。",
  domains: [{ domain: "健康状態", currentStatus: "高血圧で服薬中。", analysis: "服薬管理が要。" }],
  strengths: ["意欲が高い"],
  identifiedIssues: ["転倒予防が必要"],
  itemsToConfirm: [],
};

const carePlan: CarePlanDraft = {
  clientName: "利用者",
  intentions: "自宅で安全に暮らし続けたい。",
  assessmentSummary: "転倒リスクを抑えつつ在宅生活を支える必要がある。",
  comprehensivePolicy: "多職種連携で在宅生活を支援する。",
  needs: [
    {
      need: "転倒せず安全に移動したい",
      longTermGoal: "自宅内を安全に移動できる",
      longTermPeriod: "12か月",
      shortTermGoal: "手すりを使って移動できる",
      shortTermPeriod: "6か月",
      services: [
        {
          content: "住宅改修（手すり設置）",
          serviceType: "福祉用具",
          frequency: "1回",
          period: "6か月",
          provider: "要確認",
        },
      ],
    },
  ],
  itemsToConfirm: [],
};

describe("救済モード: 下流メモの組み立て（純粋関数）", () => {
  it("buildCarePlanNotes は人物像とアセスメント結果を含む", () => {
    const notes = buildCarePlanNotes("80代女性 独居 認知症なし", assessment);
    expect(notes).toContain("80代女性 独居 認知症なし");
    expect(notes).toContain("アセスメント結果");
    expect(notes).toContain(assessment.overview);
  });

  it("buildMeetingNotes はケアプランのニーズを引き継ぐ", () => {
    const notes = buildMeetingNotes("80代女性", carePlan);
    expect(notes).toContain("80代女性");
    expect(notes).toContain("確定したケアプラン");
    expect(notes).toContain("転倒せず安全に移動したい");
  });

  it("buildSupportNotes も人物像とケアプランを含む", () => {
    const notes = buildSupportNotes("80代女性", carePlan);
    expect(notes).toContain("80代女性");
    expect(notes).toContain("手すりを使って移動できる");
  });

  it("buildPreviousPlanSummary はケアプランの整形テキストと一致", () => {
    expect(buildPreviousPlanSummary(carePlan)).toBe(carePlanToText(carePlan));
  });

  it("buildMonitoringNotes は人物像とアセス全体像を含む", () => {
    const notes = buildMonitoringNotes("80代女性", assessment);
    expect(notes).toContain("80代女性");
    expect(notes).toContain(assessment.overview);
  });
});

describe("救済モード: 人物像フォームの合成（composePersonaNotes）", () => {
  it("入力されたフィールドだけをラベル付きで合成し、空欄は除外する", () => {
    const notes = composePersonaNotes({
      personality: "穏やかで人と話すのが好き。",
      medical: "脳梗塞の既往。降圧薬を服用。",
      lifeHistory: "", // 空欄は除外される
    });
    expect(notes).toContain("## 性格・人柄・コミュニケーション");
    expect(notes).toContain("穏やかで人と話すのが好き。");
    expect(notes).toContain("## 既往歴・診断・服薬");
    expect(notes).not.toContain("## 生活歴・これまでの暮らし");
  });

  it("clientInfo は合成メモに含めない（generatorへ別経路で渡すため）", () => {
    const notes = composePersonaNotes({ clientInfo: "85歳 女性 要介護2", personality: "明るい" });
    expect(notes).not.toContain("85歳 女性 要介護2");
    expect(notes).toContain("明るい");
  });

  it("実質的な入力が無ければ空文字（routeの必須チェックに使う）", () => {
    expect(composePersonaNotes({})).toBe("");
    expect(composePersonaNotes({ clientInfo: "85歳" })).toBe("");
  });
});
