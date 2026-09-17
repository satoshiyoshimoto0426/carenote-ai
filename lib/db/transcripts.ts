/**
 * 文字起こし全文の保存（client_transcripts）。サーバ専用。
 *
 * なぜ存在するか:
 *   吉本さん決定 D-R3（2026-09-17）「会議の文字起こし全文を残す」。
 *   ただし全文には**黒塗りが効かない生の実名**（利用者・ご家族・他事業所職員・主治医）が入る。
 *   そこで client_identities と同じくアプリ層で暗号化して保存し、復号はここでしか行わない。
 *
 * 誰が見られるか:
 *   **親の利用者が見える人だけ**。判定は lib/db/clients.getClientById（org_id または created_by）に
 *   一本化する。この表に独自のスコープ判定を書かない ── 判定が2か所に分かれると、
 *   片方だけ直したときに静かに漏れる（関係者名簿で同じ設計にしてある）。
 *
 * ⚠ ここで復号した本文を**AIへ渡してはいけない**。黒塗りを通っていない生の実名そのもの。
 *   用途は職員が画面で読み返すことだけ（「言った・言わない」の確認）。
 *
 * 何と繋がるか:
 *   表   = supabase/client_transcripts.sql
 *   鍵   = lib/privacy/crypto（CARENOTE_PII_KEY）
 *   入口 = app/api/transcripts/
 *   期限 = lib/privacy/retention（作成から5年）
 */
import { decryptString, encryptString, getPiiKey } from "@/lib/privacy/crypto";
import { computeRetentionUntil } from "@/lib/privacy/retention";
import type { TranscriptKind } from "@/lib/privacy/transcriptInput";
import { createServerClient } from "../supabase/server";
import { type DataScope, getClientById, MISSING_TABLE_CODES } from "./clients";
/**
 * 表（client_transcripts）が未作成のときに投げる。
 *
 * なぜ分けるか（独立審査 2026-09-17 critical）:
 *   ここを null で返すと、入口は「利用者が見えない」と区別できず、職員に
 *   **「権限がありません」と誤配**していた。真因は「管理者が SQL を実行していない」で、
 *   職員には直しようがないのに、管理者へ伝わる言葉がどこにも出なかった。
 *   関係者名簿の表で同じ罠を 2026-09-11 に踏んでおり、判定も文言も既にある。ここでも使う。
 */
export class TranscriptTableMissingError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "TranscriptTableMissingError";
  }
}

/** 職員に見せる文言。職員には直せないので、管理者がやることを名指しする。 */
export const TRANSCRIPT_TABLE_MISSING_MESSAGE =
  "文字起こしを保存する表が未作成です。管理者が supabase/client_transcripts.sql を Supabase で実行してください。";

/** 表が無いときのエラーなら投げる。それ以外は呼び出し側で扱う。 */
function throwIfTableMissing(error: { code?: string; message?: string } | null): void {
  if (error && MISSING_TABLE_CODES.has(error.code ?? "")) {
    throw new TranscriptTableMissingError(error.message ?? "table missing");
  }
}

/** 保存の結果。「利用者が見えない」と「保存に失敗」を取り違えないよう分ける。 */
export type SaveTranscriptResult =
  | { ok: true; transcript: TranscriptSummary }
  | { ok: false; reason: "client_not_visible" | "failed" };

/** 一覧に出す情報。**本文は含めない**（一覧のたびに復号しないため）。 */
export interface TranscriptSummary {
  id: string;
  clientId: string;
  kind: TranscriptKind;
  title: string;
  chars: number;
  createdAt: string;
  retentionUntil: string;
}

interface Row {
  id: string;
  client_id: string;
  kind: TranscriptKind;
  title: string | null;
  chars: number;
  created_at: string;
  retention_until: string;
  text_encrypted?: string;
}

const SUMMARY_COLUMNS = "id, client_id, kind, title, chars, created_at, retention_until";

function toSummary(r: Row): TranscriptSummary {
  return {
    id: r.id,
    clientId: r.client_id,
    kind: r.kind,
    title: r.title ?? "",
    chars: r.chars,
    createdAt: r.created_at,
    retentionUntil: r.retention_until,
  };
}

/**
 * 文字起こしを保存する。親の利用者が見えない人には保存させない。
 * @returns 保存できた概要。利用者が見えない・保存に失敗したときは null。
 */
export async function saveTranscript(params: {
  clientId: string;
  kind: TranscriptKind;
  title: string;
  text: string;
  userId: string;
  scope: DataScope;
}): Promise<SaveTranscriptResult> {
  const client = await getClientById(params.clientId, params.scope);
  if (!client) return { ok: false, reason: "client_not_visible" };

  const db = createServerClient();
  const { data, error } = await db
    .from("client_transcripts")
    .insert({
      client_id: params.clientId,
      org_id: params.scope.orgId,
      kind: params.kind,
      title: params.title || null,
      text_encrypted: encryptString(params.text, getPiiKey()),
      chars: params.text.length,
      retention_until: computeRetentionUntil(new Date()).toISOString(),
      created_by: params.userId,
    })
    .select(SUMMARY_COLUMNS)
    .single();
  throwIfTableMissing(error);
  if (error || !data) {
    // 本文はログに出さない（出すと暗号化した意味が消える）
    console.error("[db] saveTranscript error:", error?.message);
    return { ok: false, reason: "failed" };
  }
  return { ok: true, transcript: toSummary(data as Row) };
}

/** 指定利用者の文字起こし一覧（新しい順）。本文は返さない。 */
export async function getTranscriptsByClient(
  clientId: string,
  scope: DataScope,
): Promise<TranscriptSummary[]> {
  const client = await getClientById(clientId, scope);
  if (!client) return [];

  const db = createServerClient();
  const { data, error } = await db
    .from("client_transcripts")
    .select(SUMMARY_COLUMNS)
    .eq("client_id", clientId)
    .order("created_at", { ascending: false });
  throwIfTableMissing(error);
  if (error) {
    console.error("[db] getTranscriptsByClient error:", error.message);
    return [];
  }
  return (data as Row[]).map(toSummary);
}

/**
 * 1件の本文を復号して返す。親の利用者が見えない人には返さない。
 * 鍵が違う・中身が改ざんされていれば復号が例外を投げるので、null にして握りつぶさない。
 */
export async function getTranscriptText(
  id: string,
  scope: DataScope,
): Promise<{ summary: TranscriptSummary; text: string } | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_transcripts")
    .select(`${SUMMARY_COLUMNS}, text_encrypted`)
    .eq("id", id)
    .single();
  throwIfTableMissing(error);
  if (error || !data) return null;

  const row = data as Row;
  const client = await getClientById(row.client_id, scope);
  if (!client) return null;
  if (!row.text_encrypted) return null;

  return { summary: toSummary(row), text: decryptString(row.text_encrypted, getPiiKey()) };
}

/**
 * 1件消す。親の利用者が見えない人には消させない。
 * @returns 消せたら true。
 */
export async function deleteTranscript(id: string, scope: DataScope): Promise<boolean> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_transcripts")
    .select("id, client_id")
    .eq("id", id)
    .single();
  throwIfTableMissing(error);
  if (error || !data) return false;

  const client = await getClientById((data as Row).client_id, scope);
  if (!client) return false;

  const { error: delError } = await db.from("client_transcripts").delete().eq("id", id);
  if (delError) {
    console.error("[db] deleteTranscript error:", delError.message);
    return false;
  }
  return true;
}
