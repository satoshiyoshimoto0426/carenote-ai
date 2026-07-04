/** 保存対象の帳票種別（第6表＝給付管理は対象外）。 */
export type CareDocumentType =
  | "assessment"
  | "carePlan"
  | "meetingSummary"
  | "supportLog"
  | "monitoring";

/** 帳票の状態。 */
export type CareDocumentStatus = "draft" | "complete";

/** 帳票の生成元。 */
export type CareDocumentSource = "rescue" | "create";

/** 保存された帳票レコード（documents テーブル）。content は帳票ごとの下書きJSON。 */
export interface CareDocumentRecord {
  id: string;
  clientId: string;
  orgId: string | null;
  docType: CareDocumentType;
  status: CareDocumentStatus;
  /** 帳票ごとの下書きJSON（AssessmentDraft など）。記号で保持（実名は含めない）。 */
  content: unknown;
  source: CareDocumentSource;
  /** 保持期限（ISO日付）。created_at + 5年。 */
  retentionUntil: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 帳票保存の入力。 */
export interface CareDocumentInput {
  clientId: string;
  docType: CareDocumentType;
  content: unknown;
  source: CareDocumentSource;
  status?: CareDocumentStatus;
}
