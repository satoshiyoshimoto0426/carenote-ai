/** サービス担当者会議の出席者1名 */
export interface MeetingAttendee {
  /** 所属（事業所名など。不明なら「要確認」） */
  affiliation: string;
  /** 職種（例: 介護支援専門員 / 訪問介護員 / 理学療法士） */
  role: string;
  /** 氏名（不明なら「要確認」） */
  name: string;
}

/** 検討した項目1件とその検討内容 */
export interface MeetingDiscussion {
  /** 検討した項目（第2表のニーズ・目標に対応させる） */
  item: string;
  /** 検討内容（発言の要点。誰の発言か分かる場合は明示） */
  details: string;
}

/** 第4表（サービス担当者会議の要点）の下書き */
export interface MeetingSummaryDraft {
  /** 利用者名（不明なら「要確認」） */
  clientName: string;
  /** 開催日（不明なら「要確認」） */
  meetingDate: string;
  /** 開催場所（不明なら「要確認」） */
  meetingPlace: string;
  /** 開催時間（不明なら「要確認」） */
  meetingTime: string;
  /** 会議出席者（所属・職種・氏名） */
  attendees: MeetingAttendee[];
  /** 検討した項目と検討内容 */
  discussions: MeetingDiscussion[];
  /** 結論（会議で合意された事項を具体的に） */
  conclusion: string;
  /** 残された課題（次回の開催時期を含む） */
  remainingIssues: string;
  /** 人間のケアマネジャーの確認が必要な事項 */
  itemsToConfirm: string[];
}

/** 第4表下書き生成の入力 */
export interface MeetingSummaryInput {
  /** 利用者の基本情報（任意） */
  clientInfo?: string;
  /** 会議のメモ・録音の書き起こしなど（必須） */
  meetingNotes: string;
}
