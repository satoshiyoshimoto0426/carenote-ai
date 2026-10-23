/**
 * 就労継続支援A型の個別支援計画書（原案）の型。
 *
 * なぜあるか: 営業チームの依頼（2026-10-03）で、面談の文字起こしから、事業所の様式
 *   「個別支援計画書（就労継続支援A型事業所）」10章立てに忠実な原案を作る（docs/specs/support-plan-a/）。
 * 何と繋がるか: AI が返す形＝lib/generation/supportPlanA.ts の JSON の決まり。
 *   様式の欄への割り当て＝lib/supportPlan/format.ts。描画＝components/supportPlan/SupportPlanDocument.tsx。
 *
 * 決まり: 文字起こしに無いことは空文字 "" にする（様式では「要記入」と描く）。創作しない。
 *   氏名・受給者証番号は持たない（様式の「ID化の原則」── 利用者コードだけを書く）。
 */

/** 1. 基本情報のうち、面談の話から分かることがある欄（名簿の値があれば名簿を優先する） */
export interface SupportPlanABasic {
  /** 年齢（例「28歳」） */
  age: string;
  /** 性別 */
  sex: string;
  /** 障害種別（例「知的障害」「発達障害（自閉スペクトラム症）」） */
  disabilityType: string;
  /** 障害等級・手帳（例「療育手帳 B2」「精神障害者保健福祉手帳 3級」） */
  handbook: string;
  /** 契約形態（就労A型は通常「雇用契約（A型）」） */
  contractType: string;
  /** 入所年月日（例「2024年4月」） */
  admissionDate: string;
  /** 通所歴（例「約2年6ヶ月」） */
  attendanceHistory: string;
  /** 勤務日数（例「週4回（月・火・木・金）」） */
  workDays: string;
  /** 勤務時間（例「10:00〜15:00（休憩1時間）」） */
  workHours: string;
  /** 時給（例「1,250円」） */
  hourlyWage: string;
  /** 月平均賃金（例「約86,000円」） */
  monthlyWage: string;
}

/** 2. 利用者及び家族の意向 */
export interface SupportPlanAIntentions {
  /** 就労に関する希望・意向（本人の言葉は「」でそのまま） */
  work: string;
  /** 生活に関する希望・意向 */
  life: string;
  /** その他の希望・意向 */
  other: string;
  /** 家族の意向（同席して話した場合だけ。無ければ ""） */
  family: string;
}

/** 3. 課題・ニーズの整理の1行 */
export interface SupportPlanANeed {
  /** 課題（観察された事実として） */
  issue: string;
  /** 本人のニーズ・支援の方向性 */
  direction: string;
}

/** 3. 課題・ニーズの整理（3つの面） */
export interface SupportPlanANeeds {
  /** 3-1. 作業面 */
  work: SupportPlanANeed[];
  /** 3-2. 心理・社会参加面 */
  social: SupportPlanANeed[];
  /** 3-3. 健康面 */
  health: SupportPlanANeed[];
}

/** 5. 長期目標 */
export interface SupportPlanALongTerm {
  /** 長期目標（概ね1〜3年先） */
  goal: string;
  /** 目標達成の目安（例「2027年9月ごろ（概ね1年後）」） */
  target: string;
  /** 長期目標の背景・根拠 */
  rationale: string;
}

/** 6. 短期目標1件（評価の時期・方法は計画期間から様式の側で組み立てる） */
export interface SupportPlanAShortTerm {
  /** 見出しに出す目標（「■ 短期目標①：」の後ろ） */
  title: string;
  /** 目標の具体的内容 */
  detail: string;
  /** 支援内容 */
  support: string;
  /** 支援方法・配慮事項 */
  method: string;
  /** 担当する職種（例「職業指導員」）。分からなければ ""。名前は書かない（様式で「要記入」） */
  staffRole: string;
}

/** 7. サービスの内容及び支援の体制（サービスの種類は「就労継続支援A型」で固定） */
export interface SupportPlanAService {
  /** 提供するサービス内容（主作業・副作業など） */
  content: string;
  /** その他の関わり職員・機関（例「グループホーム職員」）。無ければ "" */
  otherStaff: string;
  /** 勤務・作業の配慮 */
  workCare: string;
  /** 健康面の配慮 */
  healthCare: string;
  /** 環境・設備の配慮 */
  envCare: string;
}

/** 8. 関係機関との連携の有無（話に出なければ「要確認」） */
export type SupportPlanALinkStatus = "あり" | "なし" | "要確認";

/** 8. 関係機関1つ分 */
export interface SupportPlanALiaison {
  status: SupportPlanALinkStatus;
  /** 相談支援専門員なら氏名（記号のまま）、医療機関なら医療機関名。分からなければ "" */
  name: string;
  /** 連携内容 */
  content: string;
}

/** 8. 関係機関との連携 */
export interface SupportPlanALiaisons {
  counselor: SupportPlanALiaison;
  medical: SupportPlanALiaison;
  family: SupportPlanALiaison;
  /** その他の関係機関（自由記述。無ければ ""） */
  others: string;
}

/** AI が返す原案（様式の2〜9章の中身と、1章の分かった欄） */
export interface SupportPlanADraft {
  /** 利用者名（記号のまま。不明なら「要確認」）。様式には印字しない（ID化の原則） */
  clientName: string;
  basic: SupportPlanABasic;
  intentions: SupportPlanAIntentions;
  needs: SupportPlanANeeds;
  /** 4. 総合的な援助方針 */
  policy: string;
  longTerm: SupportPlanALongTerm;
  /** 6. 短期目標（1〜3件） */
  shortTerms: SupportPlanAShortTerm[];
  service: SupportPlanAService;
  liaison: SupportPlanALiaisons;
  /** 9. 計画見直しの基準 */
  reviewCriteria: string;
  /** サビ管に確かめてほしいこと（推測が混じる所・記録と照らす所） */
  itemsToConfirm: string[];
}

/** 原案の生成の入力 */
export interface SupportPlanAInput {
  /** 利用者の基本情報（名簿から。任意） */
  clientInfo?: string;
  /** 面談の文字起こし・メモ（必須） */
  interviewNotes: string;
}
