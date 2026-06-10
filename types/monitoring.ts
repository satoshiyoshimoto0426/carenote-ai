/** モニタリングにおける目標1件の評価 */
export interface GoalEvaluation {
  /** 評価対象の目標（前回プランの短期目標など） */
  goal: string;
  /** 達成状況（達成 / 一部達成 / 未達成 ＋ 変化の方向） */
  achievement: string;
  /** 判定の根拠となる事実・本人や家族の様子 */
  evidence: string;
  /** 今後の提案（継続・修正・終了など） */
  proposal: string;
}

/** モニタリング記録の下書き */
export interface MonitoringDraft {
  /** 利用者名（入力から不明なら「要確認」） */
  clientName: string;
  /** 総合所見 */
  overallSummary: string;
  /** 目標ごとの達成状況評価 */
  goalEvaluations: GoalEvaluation[];
  /** プラン全体の判断（継続 / 一部見直し / 再アセスメント推奨）と理由 */
  planRecommendation: string;
  /** 入力から判断できず、人間のケアマネジャーの確認が必要な事項 */
  itemsToConfirm: string[];
}

/** モニタリング下書き生成の入力 */
export interface MonitoringInput {
  /** 利用者の基本情報（任意） */
  clientInfo?: string;
  /** 前回のケアプランの目標・サービスの要約（必須） */
  previousPlanSummary: string;
  /** 最新の状況・モニタリング訪問で得た情報（必須） */
  monitoringNotes: string;
}
