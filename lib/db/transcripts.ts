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
 *   getClientById が DB を読めずに投げる ClientLookupError は、ここで握らずにそのまま投げる
 *   （「見えない」と取り違えない ── 2026-09-24 検収の指摘。入口が 503 にする）。
 *   この表そのものを読み書きできなかったときも、0件・「見つかりません」と答えず DbAccessError を投げる
 *   （lib/db/errors.ts。以前は一覧が []、本文と削除が null・false で、入口は 404「見つかりませんでした。」だった）。
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
import { dbAccessError, dbFailedMessage, isMalformedIdError } from "./errors";
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

/** 文字起こしの一覧を DB から読めなかったとき、職員に見せる文（GET /api/transcripts が 503 で返す）。 */
export const TRANSCRIPTS_LOAD_FAILED_MESSAGE = dbFailedMessage(
  "保存した文字起こしの一覧を読み込めませんでした。",
);

/** 文字起こしの本文を DB から読めなかったとき、職員に見せる文（GET /api/transcripts/[id] が 503 で返す）。 */
export const TRANSCRIPT_READ_FAILED_MESSAGE = dbFailedMessage(
  "保存した文字起こしを読み込めませんでした。",
);

/**
 * 文字起こしを DB から消せなかったとき、職員に見せる文（DELETE /api/transcripts/[id] が 503 で返す）。
 * 「消えていません」と言い切る ── 消す前の読み出しか、消す操作そのものが失敗しているので、行は残っている。
 */
export const TRANSCRIPT_DELETE_FAILED_MESSAGE = dbFailedMessage(
  "文字起こしを消せませんでした（消えていません）。",
);

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
 * @returns 保存できたら概要。利用者が見えなければ reason "client_not_visible"、書き込みに失敗したら "failed"。
 * @throws ClientLookupError 親の利用者を DB から読めなかったとき（書き込まない）。
 * @throws TranscriptTableMissingError 表が未作成のとき。
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

/**
 * 指定利用者の文字起こし一覧（新しい順）。本文は返さない。利用者が見えなければ空。
 * @throws ClientLookupError 親の利用者を DB から読めなかったとき（空の一覧に見せない）。
 * @throws DbAccessError 一覧そのものを DB から読めなかったとき（同じ理由で空にしない）。
 */
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
  if (error) throw dbAccessError("getTranscriptsByClient", error, TRANSCRIPTS_LOAD_FAILED_MESSAGE);
  return ((data ?? []) as Row[]).map(toSummary);
}

/**
 * 1件の本文を復号して返す。親の利用者が見えない人には返さない。
 * 鍵が違う・中身が改ざんされていれば復号が例外を投げるので、null にして握りつぶさない。
 * @returns 本文と概要。行が無い・id が uuid の形でない・親の利用者が見えないときは null（入口は 404）。
 * @throws ClientLookupError 親の利用者を DB から読めなかったとき。
 * @throws DbAccessError 行を DB から読めなかったとき（0件をエラーにしない maybeSingle で読むので、
 *   ここに来るのは本当の失敗だけ。以前は single() で読み、失敗も null＝「見つかりませんでした」だった）。
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
    .maybeSingle();
  throwIfTableMissing(error);
  if (error) {
    if (isMalformedIdError(error)) return null;
    throw dbAccessError("getTranscriptText", error, TRANSCRIPT_READ_FAILED_MESSAGE);
  }
  if (!data) return null;

  const row = data as Row;
  const client = await getClientById(row.client_id, scope);
  if (!client) return null;
  if (!row.text_encrypted) return null;

  return { summary: toSummary(row), text: decryptString(row.text_encrypted, getPiiKey()) };
}

/**
 * 1件消す。親の利用者が見えない人には消させない。
 * @returns 消せたら true。行が無い・id が uuid の形でない・親の利用者が見えない・消す間際に他の人が消していた
 *   ときは false（入口は 404「見つかりませんでした。」）。
 * @throws ClientLookupError 親の利用者を DB から読めなかったとき（消さない・false と答えない）。
 * @throws DbAccessError 行を読めなかった・消す操作が失敗したとき（以前は false で、消えていないのに
 *   「見つかりませんでした」＝もう無い、と伝わっていた ── 2026-09-24 検収の指摘）。
 */
export async function deleteTranscript(id: string, scope: DataScope): Promise<boolean> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_transcripts")
    .select("id, client_id")
    .eq("id", id)
    .maybeSingle();
  throwIfTableMissing(error);
  if (error) {
    if (isMalformedIdError(error)) return false;
    throw dbAccessError("deleteTranscript", error, TRANSCRIPT_DELETE_FAILED_MESSAGE);
  }
  if (!data) return false;

  const client = await getClientById((data as Row).client_id, scope);
  if (!client) return false;

  // 消えた行を返させて、本当に消えた件数を見る（Supabase は既定で消した行を返さない）
  const { data: deleted, error: delError } = await db
    .from("client_transcripts")
    .delete()
    .eq("id", id)
    .select("id");
  if (delError) throw dbAccessError("deleteTranscript", delError, TRANSCRIPT_DELETE_FAILED_MESSAGE);
  return (deleted ?? []).length > 0;
}
