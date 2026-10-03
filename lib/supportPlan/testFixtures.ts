import type { SupportPlanADraft } from "@/types/supportPlanA";
import type { SupportPlanAMeta } from "./format";

/**
 * 試験用の原案と様式の外の値（すべて架空の利用者 K-014）。lib/supportPlan と components/supportPlan の試験が使う。
 * 実在の方の情報は入れない（契約前は試験用のデータだけ ── 吉本さんの決まり）。
 */
export const SAMPLE_META: SupportPlanAMeta = {
  clientCode: "K-014",
  clientLabel: "利用者K",
  periodStart: "2026-10-01",
  periodEnd: "2027-03-31",
  createdAt: "2026-09-30",
  sourceLabel: "面談の録音の文字起こし（K-014 アセスメント面談）",
  familyPresent: false,
};

/** 中身の詰まった原案（様式の全章が埋まる形） */
export function sampleDraft(): SupportPlanADraft {
  return {
    clientName: "K様",
    basic: {
      age: "28歳",
      sex: "女性",
      disabilityType: "発達障害（自閉スペクトラム症）",
      handbook: "精神障害者保健福祉手帳 3級",
      contractType: "雇用契約（A型）",
      admissionDate: "2024年4月",
      attendanceHistory: "約2年6ヶ月",
      workDays: "週4回（月・火・木・金）",
      workHours: "10:00〜15:00（休憩1時間）",
      hourlyWage: "1,250円",
      monthlyWage: "約86,000円",
    },
    intentions: {
      work: "「ラベル貼りは得意。きれいに並ぶとうれしい」。",
      life: "「一人暮らしに慣れてきた」。",
      other: "「休みの日はイラストを描いている」。",
      family: "",
    },
    needs: {
      work: [
        { issue: "途中で声をかけられると手順が分からなくなる", direction: "声かけはメモで渡す。" },
      ],
      social: [
        { issue: "困ったことを自分から相談しにくい", direction: "週1回の振り返り面談を行う。" },
      ],
      health: [
        { issue: "睡眠のリズムが乱れると遅刻がある", direction: "睡眠の記録を一緒に確認する。" },
      ],
    },
    policy: "得意な作業を強みとして伸ばし、安心して働き続けられるよう支援する。",
    longTerm: {
      goal: "データ入力を1日2時間、正確に続ける。",
      target: "2027年9月ごろ（概ね1年後）",
      rationale: "入力の正確さが高い。",
    },
    shortTerms: [
      {
        title: "データ入力を1回60分まで集中して続ける",
        detail: "50分の入力と10分の休憩を1セットとして続ける。",
        support: "作業時間をタイマーで見える化する。",
        method: "声かけは最小限にする。",
        staffRole: "職業指導員",
      },
      {
        title: "困ったことを週1回の振り返り面談で伝える",
        detail: "困ったことを1つ以上話せる。",
        support: "毎週金曜に振り返り面談を行う。",
        method: "答えを急がせない。",
        staffRole: "",
      },
    ],
    service: {
      content: "食品の袋詰め・ラベル貼りを主作業とする。",
      otherStaff: "相談支援専門員",
      workCare: "作業変更の事前の予告。",
      healthCare: "睡眠の記録の確認。",
      envCare: "静かな席の確保。",
    },
    liaison: {
      counselor: { status: "あり", name: "", content: "本計画を交付する。" },
      medical: { status: "あり", name: "心療内科クリニック", content: "月1回受診。" },
      family: { status: "要確認", name: "", content: "" },
      others: "",
    },
    reviewCriteria: "短期目標①の達成度が「3.概ね達成」を下回る状態が続いた場合に見直す。",
    itemsToConfirm: ["遅刻の回数は記録と合っているか"],
  };
}

/** 面談でほとんど何も分からなかった原案（すべての文が空） */
export function emptyDraft(): SupportPlanADraft {
  const blankLiaison = { status: "要確認" as const, name: "", content: "" };
  return {
    clientName: "",
    basic: {
      age: "",
      sex: "",
      disabilityType: "",
      handbook: "",
      contractType: "",
      admissionDate: "",
      attendanceHistory: "",
      workDays: "",
      workHours: "",
      hourlyWage: "",
      monthlyWage: "",
    },
    intentions: { work: "", life: "", other: "", family: "" },
    needs: { work: [], social: [], health: [] },
    policy: "",
    longTerm: { goal: "", target: "", rationale: "" },
    shortTerms: [],
    service: { content: "", otherStaff: "", workCare: "", healthCare: "", envCare: "" },
    liaison: { counselor: blankLiaison, medical: blankLiaison, family: blankLiaison, others: "" },
    reviewCriteria: "",
    itemsToConfirm: [],
  };
}
