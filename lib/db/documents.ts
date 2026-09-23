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
 * 保存帳票(documents)のデータアクセス。機能仕様 §6。retention_until は created_at + 5年。
 *
 * content に入るもの（暗号化していない JSONB。暗号化してあるのは名簿の氏名 client_identities /
 * client_related_identities と文字起こし client_transcripts で、この表は対象外）:
 *   帳票ごとの下書き JSON を、AI の返事を画面に返した形のまま保存する。
 *   - 名簿に載っている利用者・関係者の名前は記号（A様・A様の長女）のまま。保存の前に実名へは戻さない
 *     （「実名で表示」の restoreNamesDeep は画面とコピー専用）。
 *   - 電話番号・住所・郵便番号・メールアドレス・生年月日・番号（区切りの無い8〜12桁と、4桁区切りの12桁）
 *     （lib/privacy/patterns.ts の型）は、
 *     AI へ送る時だけ札（〔電話番号1〕）にし、返事を画面へ返す前に restoreDeep で**元の値へ戻してある**ので、
 *     元の値のまま入る（/api/generate の予定 appointments だけは札のまま。吉本さん決定 2026-09-12
 *     「確認用の情報も蓄積したい」・docs/specs/call-pipeline.md §2.5）。
 *   - 名簿に無い名前（職員がメモに書いた第三者など）は最初から置き換わらないので、そのまま入り得る。
 *   したがって「実名を含めない」は保証していない。
 *
 * 誰が読めるか: 作成した職員本人（created_by）だけ（事業所での共有は未対応）。
 * 保存先の利用者が本人に見えるかは、呼ぶ側の app/api/documents/route.ts が getClientById で確かめる。
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
