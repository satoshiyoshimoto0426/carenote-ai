/** アセスメントの分析領域1件（健康状態/ADL/IADL/認知/社会参加/住環境/介護環境 等） */
export interface AssessmentDomain {
  /** 領域名 */
  domain: string;
  /** 現状（観察・発言などの事実） */
  currentStatus: string;
  /** 分析（背景要因・リスク・強みの解釈） */
  analysis: string;
}

/** アセスメント（課題分析）の下書き */
export interface AssessmentDraft {
  /** 利用者名（入力から不明なら「要確認」） */
  clientName: string;
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
