/** 支援経過記録（第5表）の1エントリ。「対応内容→背景→事実・発言→判断→今後」の5層構造 */
export interface SupportLogEntry {
  /** 年月日（時刻があれば含む。メモから不明なら「要確認」） */
  date: string;
  /** 記録の種別（例: モニタリング訪問 / 電話連絡（家族） / 事業所調整 / 担当者会議 / 入退院連携 等） */
  category: string;
  /** 対応内容: いつ・どこで・誰が・何をしたか（簡潔な事実） */
  action: string;
  /** 背景・理由: なぜその対応が必要だったか */
  background: string;
  /** 事実・発言: 客観的状態と本人・家族・関係者の言葉（「」で記載） */
  factsAndStatements: string;
  /** アセスメント・判断: ケアマネジャーとしての見解・結論 */
  judgement: string;
  /** 今後の対応: 次のアクション・方針 */
  nextAction: string;
}

/** 支援経過記録（第5表）の下書き */
export interface SupportLogDraft {
  /** 利用者名（不明なら「要確認」） */
  clientName: string;
  /** 経過記録エントリ（時系列。別の日・別の案件は分割する） */
  entries: SupportLogEntry[];
  /** 人間のケアマネジャーの確認が必要な事項 */
  itemsToConfirm: string[];
}

/** 支援経過記録の生成入力 */
export interface SupportLogInput {
  /** 利用者の基本情報（任意） */
  clientInfo?: string;
  /** 対応のメモ（訪問・電話・調整などの殴り書き。必須） */
  supportNotes: string;
}
