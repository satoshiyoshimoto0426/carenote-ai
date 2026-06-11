/** 第2表のサービス1件（サービス内容・種別・頻度・期間） */
export interface CarePlanService {
  /** サービス内容（具体的な支援内容） */
  content: string;
  /** サービス種別（例: 訪問介護 / 通所介護 / 家族・地域などのインフォーマル支援） */
  serviceType: string;
  /** 頻度（例: 週2回） */
  frequency: string;
  /** 期間（例: 6か月） */
  period: string;
  /** 担当者（事業所名・家族・本人など。未定なら「要確認」） */
  provider: string;
}

/** 第2表の「生活全般の解決すべき課題（ニーズ）」1件と、その目標・サービス */
export interface CarePlanNeed {
  /** 生活全般の解決すべき課題（ニーズ）。利用者主体の表現で記載。 */
  need: string;
  /** 長期目標 */
  longTermGoal: string;
  /** 長期目標の期間（例: 6か月） */
  longTermPeriod: string;
  /** 短期目標 */
  shortTermGoal: string;
  /** 短期目標の期間（例: 3か月） */
  shortTermPeriod: string;
  /** このニーズに対応するサービス内容 */
  services: CarePlanService[];
}

/** ケアプラン本体（第1表の要点＋第2表）の下書き */
export interface CarePlanDraft {
  /** 利用者名（入力から不明なら「要確認」） */
  clientName: string;
  /** 第1表: 利用者及び家族の生活に対する意向 */
  intentions: string;
  /** 第1表: 意向を踏まえた課題分析の結果（なぜ・どのような支援が必要か） */
  assessmentSummary: string;
  /** 第1表: 総合的な援助の方針 */
  comprehensivePolicy: string;
  /** 第2表: 解決すべき課題（ニーズ）と目標・サービス */
  needs: CarePlanNeed[];
  /** AIが入力から判断できず、人間のケアマネジャーの確認が必要な事項 */
  itemsToConfirm: string[];
}

/** ケアプラン下書き生成の入力 */
export interface CarePlanInput {
  /** 利用者の基本情報（任意。氏名・年齢・要介護度・家族構成など） */
  clientInfo?: string;
  /** 面談メモ・アセスメント結果など、下書きの材料となる自由記述（必須） */
  assessmentNotes: string;
}
