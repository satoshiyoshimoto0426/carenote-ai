/** 利用者の非識別属性（識別子は含めない。識別情報は client_identities に暗号化保存）。 */
export interface ClientAttributes {
  /** 年齢（例: "85歳"） */
  age?: string;
  /** 性別 */
  gender?: string;
  /** 要介護度（例: "要介護2"） */
  careLevel?: string;
  /** 世帯（例: "独居"） */
  household?: string;
}

/** 利用者レコード（clients テーブル。実名は持たない＝code で表示）。 */
export interface ClientRecord {
  id: string;
  /** Clerk organization id（null可。org単位共有はフェーズ2） */
  orgId: string | null;
  /** 表示記号（例: "A"。UIでは「A様」と表示） */
  code: string;
  attributes: ClientAttributes;
  /** 作成した Clerk userId */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 利用者作成の入力。氏名は暗号化して client_identities に保存する。 */
export interface ClientInput {
  /** 実名（任意。Claudeへは送らない・暗号化保存） */
  name?: string;
  attributes?: ClientAttributes;
}
