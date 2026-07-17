import { computeRetentionUntil } from "@/lib/privacy/retention";
import type {
  CareDocumentInput,
  CareDocumentRecord,
  CareDocumentSource,
  CareDocumentStatus,
  CareDocumentType,
} from "@/types/document";
import { createServerClient } from "../supabase/server";

/**
 * 保存帳票(documents)のデータアクセス。機能仕様 §6。
 * content は帳票ごとの下書きJSON（記号で保持・実名を含めない）。retention_until は created_at + 5年。
 */

interface DocRow {
  id: string;
  client_id: string;
  org_id: string | null;
  doc_type: CareDocumentType;
  status: CareDocumentStatus;
  content: unknown;
  source: CareDocumentSource;
  retention_until: string;
  approved_at: string | null;
  approved_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toRecord(r: DocRow): CareDocumentRecord {
  return {
    id: r.id,
    clientId: r.client_id,
    orgId: r.org_id,
    docType: r.doc_type,
    status: r.status,
    content: r.content,
    source: r.source,
    retentionUntil: r.retention_until,
    approvedAt: r.approved_at,
    approvedBy: r.approved_by,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 帳票を保存する（保持期限を自動付与）。status は常に draft（G4: 承認は保存後の人間操作のみ）。 */
export async function saveDocument(params: {
  userId: string;
  orgId: string | null;
  input: CareDocumentInput;
}): Promise<CareDocumentRecord | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("documents")
    .insert({
      client_id: params.input.clientId,
      org_id: params.orgId,
      doc_type: params.input.docType,
      status: "draft",
      content: params.input.content,
      source: params.input.source,
      retention_until: computeRetentionUntil(new Date()).toISOString(),
      created_by: params.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error("[db] saveDocument error:", error?.message);
    return null;
  }
  return toRecord(data as DocRow);
}

/** 指定利用者の保存帳票一覧（所有者チェック込み）。 */
export async function getDocumentsByClient(
  clientId: string,
  userId: string,
): Promise<CareDocumentRecord[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("documents")
    .select("*")
    .eq("client_id", clientId)
    .eq("created_by", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[db] getDocumentsByClient error:", error.message);
    return [];
  }
  return (data as DocRow[]).map(toRecord);
}

/**
 * 帳票を承認する（G4: 人間操作のみ。PATCH /api/documents/[id] から呼ばれる）。
 * approved_at / approved_by を監査証跡として記録。所有者（created_by）以外は更新できず null。
 */
export async function approveDocument(
  id: string,
  userId: string,
): Promise<CareDocumentRecord | null> {
  const db = createServerClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from("documents")
    .update({
      status: "approved",
      approved_at: now,
      approved_by: userId,
      updated_at: now,
    })
    .eq("id", id)
    .eq("created_by", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[db] approveDocument error:", error.message);
    return null;
  }
  return toRecord(data as DocRow);
}

/**
 * 承認を取り消して draft に戻す（G4）。approved_at / approved_by も null に戻す。
 * 所有者（created_by）以外は更新できず null。
 */
export async function unapproveDocument(
  id: string,
  userId: string,
): Promise<CareDocumentRecord | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("documents")
    .update({
      status: "draft",
      approved_at: null,
      approved_by: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("created_by", userId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[db] unapproveDocument error:", error.message);
    return null;
  }
  return toRecord(data as DocRow);
}
