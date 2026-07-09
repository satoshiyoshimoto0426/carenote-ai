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
  composeRescueNotes,
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

  it("timeline は意向の後・補足の前にラベル付きで合成される", () => {
    const notes = composePersonaNotes({
      intentions: "自宅で暮らし続けたい。",
      timeline: "2026-04-01 初回相談\n2026-04-10 初回訪問",
      additionalNotes: "補足メモ。",
    });
    expect(notes).toContain("## 関わりの経過・時系列（開始時期・出来事）");
    expect(notes).toContain("2026-04-10 初回訪問");
    const intentionsIdx = notes.indexOf("## 本人・家族の意向・希望");
    const timelineIdx = notes.indexOf("## 関わりの経過・時系列");
    const additionalIdx = notes.indexOf("## その他・補足");
    expect(intentionsIdx).toBeLessThan(timelineIdx);
    expect(timelineIdx).toBeLessThan(additionalIdx);
  });
});

describe("救済モード: 統合読解サマリの連結（composeRescueNotes）", () => {
  it("intakeSummary があれば「提供書類の読み取り」見出しで先頭に連結する", () => {
    const notes = composeRescueNotes(
      { personality: "穏やかな性格。" },
      "本人は脳梗塞の既往あり（出典: 診療情報提供書.pdf）",
    );
    expect(notes.startsWith("## 提供書類の読み取り（AIによる統合・出典付き）")).toBe(true);
    expect(notes).toContain("診療情報提供書.pdf");
    expect(notes).toContain("## 性格・人柄・コミュニケーション");
    expect(notes.indexOf("提供書類の読み取り")).toBeLessThan(notes.indexOf("穏やかな性格"));
  });

  it("intakeSummary が無ければ従来の composePersonaNotes と同じ", () => {
    const persona = { personality: "穏やかな性格。" };
    expect(composeRescueNotes(persona)).toBe(composePersonaNotes(persona));
    expect(composeRescueNotes(persona, "   ")).toBe(composePersonaNotes(persona));
  });

  it("人物像が空でもサマリだけで成立する（資料のみ生成）", () => {
    const notes = composeRescueNotes({}, "要介護3相当の記載あり（出典: 基本情報.pdf）");
    expect(notes).toContain("## 提供書類の読み取り");
    expect(notes).toContain("基本情報.pdf");
    expect(notes.endsWith("（出典: 基本情報.pdf）")).toBe(true);
  });
});
