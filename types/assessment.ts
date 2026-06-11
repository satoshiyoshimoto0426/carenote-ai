/** 課題分析標準項目（2023年改定）の課題分析14項目のうちの1項目 */
export interface AssessmentDomain {
  /** 項目名（課題分析標準項目の正式名称。スキーマでenum強制） */
  domain: string;
  /** 現状（観察・発言などの事実。情報が無ければ「情報なし（要確認）」） */
  currentStatus: string;
  /** 分析（背景要因・リスク・強みの解釈） */
  analysis: string;
}

/** アセスメント（課題分析）の下書き。課題分析標準項目（2023年改定）に準拠 */
export interface AssessmentDraft {
  /** 利用者名（入力から不明なら「要確認」） */
  clientName: string;
  /** 今回のアセスメントの理由（初回/更新/状態変化等。不明なら要確認） */
  assessmentReason: string;
  /** 主訴・意向（本人と家族を分けて記載） */
  mainComplaints: string;
  /** これまでの生活と現在の状況（生活歴） */
  lifeHistory: string;
  /** 現在利用している支援・社会資源の状況（公的・インフォーマル含む） */
  currentServices: string;
  /** 全体像の要約 */
  overview: string;
  /** 領域ごとの現状と分析 */
  domains: AssessmentDomain[];
  /** 本人の強み・できること（ストレングス） */
  strengths: string[];
  /** 抽出された生活課題の候補（ケアプラン第2表のニーズの元になる） */
  identifiedIssues: string[];
  /** 入力から判断できず、人間のケアマネジャーの確認が必要な事項 */
  itemsToConfirm: string[];
}

/** アセスメント下書き生成の入力 */
export interface AssessmentInput {
  /** 利用者の基本情報（任意） */
  clientInfo?: string;
  /** 面談メモ・収集した情報（必須） */
  assessmentNotes: string;
}
