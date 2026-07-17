import { decryptString, encryptString, getPiiKey } from "@/lib/privacy/crypto";
import { nextClientCode } from "@/lib/privacy/pseudonymize";
import type { ClientAttributes, ClientInput, ClientRecord } from "@/types/client";
import { createServerClient } from "../supabase/server";

/**
 * 利用者(clients)のデータアクセス。機能仕様 §6/§8。
 * 既存 lib/db.ts と同方式：サーバ専用クライアント(service role)＋アプリ層で created_by スコープ。
 * 実名は client_identities に暗号化保存し、Claude へは渡さない。
 */

interface ClientRow {
  id: string;
  org_id: string | null;
  code: string;
  attributes: ClientAttributes;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toRecord(r: ClientRow): ClientRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    code: r.code,
    attributes: r.attributes ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 利用者を作成する。記号(code)を自動採番し、実名があれば暗号化して別テーブルに保存する。 */
export async function createClientRecord(params: {
  userId: string;
  orgId: string | null;
  input: ClientInput;
}): Promise<ClientRecord | null> {
  const db = createServerClient();
  const { count } = await db
    .from("clients")
    .select("id", { count: "exact", head: true })
    .eq("created_by", params.userId);
  const code = nextClientCode(count ?? 0);

  const { data, error } = await db
    .from("clients")
    .insert({
      org_id: params.orgId,
      code,
      attributes: params.input.attributes ?? {},
      created_by: params.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db] createClientRecord error:", error?.message);
    return null;
  }
  const row = data as ClientRow;

  const name = params.input.name?.trim();
  if (name) {
    const { error: idErr } = await db.from("client_identities").insert({
      client_id: row.id,
      org_id: params.orgId,
      name_encrypted: encryptString(name, getPiiKey()),
      created_by: params.userId,
    });
    if (idErr) console.error("[db] createClientRecord identity error:", idErr.message);
  }
  return toRecord(row);
}

/** 自分が作成した利用者の一覧。 */
export async function getClients(userId: string): Promise<ClientRecord[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[db] getClients error:", error.message);
    return [];
  }
  return (data as ClientRow[]).map(toRecord);
}

/** 利用者を1件取得（所有者チェック込み）。 */
export async function getClientById(id: string, userId: string): Promise<ClientRecord | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", id)
    .eq("created_by", userId)
    .single();
  if (error || !data) return null;
  return toRecord(data as ClientRow);
}

/** 実名を復号して返す（権限内・必要時のみ）。失敗時は null。 */
export async function getClientName(clientId: string, userId: string): Promise<string | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_identities")
    .select("name_encrypted")
    .eq("client_id", clientId)
    .eq("created_by", userId)
    .single();
  if (error || !data) return null;
  try {
    return decryptString((data as { name_encrypted: string }).name_encrypted, getPiiKey());
  } catch {
    return null;
  }
}
