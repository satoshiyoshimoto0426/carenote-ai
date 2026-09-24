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
  /**
   * 帳票ごとの下書きJSON（AssessmentDraft など）。名簿の名前は記号のまま、電話番号・住所などの型は
   * 元の値へ戻した形、名簿に無い名前はそのまま入り得る（実名を含めないとは言えない。詳細は lib/db/documents.ts）。
   */
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

/**
 * 保存帳票の「どの利用者の・どの種類が・いつ・どの状態で」だけを持つ形（中身の content は持たない）。
 *
 * なぜあるか（2026-09-24・作り直し計画 U5）: 利用者一覧に種類ごとの最新日付と「更新」の列を出すのに、
 * 下書きの本文（暗号化していない JSONB）は要らない。日付のためだけに本文をサーバのメモリや応答へ運ばない。
 * 何と繋がるか: lib/db/documents.ts の getLatestDocMeta が返し、lib/documents/latest.ts の
 * summarizeLatestDocs が利用者ごとにまとめ、app/api/clients/latest-docs/route.ts が画面へ返す。
 */
export interface CareDocumentMeta {
  clientId: string;
  docType: CareDocumentType;
  status: CareDocumentStatus;
  /** 保存した日時（DB の created_at。ISO 形式） */
  createdAt: string;
}
