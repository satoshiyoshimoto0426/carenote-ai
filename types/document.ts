/** 保存対象の帳票種別（第6表＝給付管理は対象外）。 */
export type CareDocumentType =
  | "assessment"
  | "carePlan"
  | "meetingSummary"
  | "supportLog"
  | "monitoring";

/**
 * 帳票の状態（G4 承認モデル）。保存直後は常に draft。
 * approved は PATCH /api/documents/[id] の人間操作でのみ付く（AIが承認済みにはできない）。
 */
export type CareDocumentStatus = "draft" | "approved";

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
  /** 承認日時（ISO）。未承認は null（G4 監査証跡）。 */
  approvedAt: string | null;
  /** 承認者（Clerk userId）。未承認は null（G4 監査証跡）。 */
  approvedBy: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 帳票保存の入力。status は持たない＝保存は常に draft（G4: 承認は保存後の人間操作のみ）。 */
export interface CareDocumentInput {
  clientId: string;
  docType: CareDocumentType;
  content: unknown;
  source: CareDocumentSource;
}
