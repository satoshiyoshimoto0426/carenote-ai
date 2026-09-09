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

/**
 * メモから読み取れた「これから」の予定（第4段: カレンダー登録用）。
 * 実名・電話番号・住所は入れない（title は「A様 面談」のように記号＋用件）。
 */
export interface Appointment {
  /** 予定の名前（記号＋用件。例:「A様 自宅で面談」） */
  title: string;
  /** 日付 YYYY-MM-DD。年が読み取れない場合はメモの文脈から推定し confidence を「要確認」にする */
  date: string;
  /** 開始 HH:mm（24時間）。不明なら空文字＝終日 */
  startTime: string;
  /** 終了 HH:mm。不明なら空文字（既定60分） */
  endTime: string;
  /** 場所（自宅・事業所・〇〇病院 など。住所は書かない） */
  location: string;
  /** 短い補足（持ち物・同席者の続柄など。電話番号を書かない） */
  note: string;
  /** 日時が明確なら「確定」、推定を含むなら「要確認」 */
  confidence: "確定" | "要確認";
}

/** 支援経過記録（第5表）の下書き */
export interface SupportLogDraft {
  /** 利用者名（不明なら「要確認」） */
  clientName: string;
  /** 経過記録エントリ（時系列。別の日・別の案件は分割する） */
  entries: SupportLogEntry[];
  /** メモに含まれる今後の予定（無ければ空配列）。旧データには無いので省略可 */
  appointments?: Appointment[];
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
