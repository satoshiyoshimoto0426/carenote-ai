import { describe, expect, it } from "vitest";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "./draftText";

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
        {
          content: "歩行訓練",
          serviceType: "通所リハビリ",
          frequency: "週2回",
          period: "3か月",
          provider: "通所リハビリ事業所（要確認）",
        },
      ],
    },
  ],
  itemsToConfirm: ["夜間のトイレ状況"],
};

const assessment: AssessmentDraft = {
  clientName: "山田花子",
  assessmentReason: "退院後の初回アセスメント",
  mainComplaints: "本人「また友達とお茶会をしたい」/ 夫「介助の負担を減らしたい」",
  lifeHistory: "半年前に骨折し退院後は自宅で夫と二人暮らし",
  currentServices: "デイサービス週1回を利用中",
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
    expect(text).toContain(
      "歩行訓練 / 通所リハビリ / 週2回 / 3か月 / 担当: 通所リハビリ事業所（要確認）",
    );
    expect(text).toContain("【要確認事項】");
    expect(text).toContain("・夜間のトイレ状況");
  });
});

describe("assessmentToText", () => {
  it("基本情報・全体像・項目・強み・課題候補・要確認を含む", () => {
    const text = assessmentToText(assessment);
    expect(text).toContain("【今回のアセスメントの理由】");
    expect(text).toContain("【主訴・意向】");
    expect(text).toContain("また友達とお茶会をしたい");
    expect(text).toContain("【これまでの生活と現在の状況（生活歴）】");
    expect(text).toContain("【現在利用している支援・社会資源】");
    expect(text).toContain("【全体像】");
    expect(text).toContain("【課題分析14項目（標準項目準拠）】");
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

const meetingSummary: MeetingSummaryDraft = {
  clientName: "山田花子",
  meetingDate: "2026年6月10日",
  meetingPlace: "利用者自宅",
  meetingTime: "14:00〜14:45",
  attendees: [
    { affiliation: "○○居宅介護支援事業所", role: "介護支援専門員", name: "吉本" },
    { affiliation: "△△通所リハビリ", role: "理学療法士", name: "要確認" },
  ],
  discussions: [
    {
      item: "屋内移動の安定（短期目標の達成状況）",
      details: "理学療法士より「下肢筋力は改善傾向」との報告。",
    },
  ],
  conclusion: "通所リハビリを週2回で継続する。次回モニタリングで屋外歩行を再評価する。",
  remainingIssues: "夜間の動線整備は次回会議で検討（次回: 3か月後を目安）。",
  itemsToConfirm: ["理学療法士の氏名"],
};

describe("meetingSummaryToText", () => {
  it("開催情報・出席者・検討・結論・残課題・要確認を含む", () => {
    const text = meetingSummaryToText(meetingSummary);
    expect(text).toContain("開催日: 2026年6月10日");
    expect(text).toContain("【会議出席者】");
    expect(text).toContain("・○○居宅介護支援事業所（介護支援専門員） 吉本");
    expect(text).toContain("1. 屋内移動の安定（短期目標の達成状況）");
    expect(text).toContain("【結論】");
    expect(text).toContain("【残された課題（次回の開催時期）】");
    expect(text).toContain("・理学療法士の氏名");
  });
});

const supportLog: SupportLogDraft = {
  clientName: "山田花子",
  entries: [
    {
      date: "2026年6月11日 10:00",
      category: "電話連絡（家族）",
      action: "長女より電話連絡あり。その後デイサービスへ当日の様子を確認した。",
      background: "夜間の不眠と日中の傾眠について相談があったため。",
      factsAndStatements:
        "長女「夜中に何度も起きてしまうようです」。デイ相談員「活動中の居眠りが増えています」。",
      judgement: "服薬や体調変化の影響が考えられ、要因の特定が必要と判断する。",
      nextAction: "次回訪問時にお薬手帳を確認し、必要に応じて主治医への相談を家族へ提案する。",
    },
  ],
  itemsToConfirm: ["直近の処方変更の有無"],
};

describe("supportLogToText", () => {
  it("日付・種別・5項目・要確認を含む", () => {
    const text = supportLogToText(supportLog);
    expect(text).toContain("■ 2026年6月11日 10:00（電話連絡（家族））");
    expect(text).toContain("【対応内容】長女より電話連絡あり");
    expect(text).toContain("【背景・理由】");
    expect(text).toContain("【事実・発言】長女「夜中に何度も起きてしまうようです」");
    expect(text).toContain("【アセスメント・判断】");
    expect(text).toContain("【今後の対応】");
    expect(text).toContain("・直近の処方変更の有無");
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
