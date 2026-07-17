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
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 帳票を保存する（保持期限を自動付与）。 */
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
      status: params.input.status ?? "draft",
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
