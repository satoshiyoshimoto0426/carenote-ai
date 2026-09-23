import { computeRetentionUntil } from "@/lib/privacy/retention";
import type {
  CareDocumentInput,
  CareDocumentMeta,
  CareDocumentRecord,
  CareDocumentSource,
  CareDocumentStatus,
  CareDocumentType,
} from "@/types/document";
import { createServerClient } from "../supabase/server";
import { dbAccessError, dbFailedMessage, isMalformedIdError } from "./errors";

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
 * 誰が読めるか: 作成した職員本人（created_by）だけ（事業所での共有は未対応）。利用者一覧の日付の列
 * （getLatestDocMeta）も同じ範囲で読む。
 * 保存先の利用者が本人に見えるかは、呼ぶ側の app/api/documents/route.ts が getClientById で確かめる。
 *
 * DB の失敗は「0件・見つからない」と分ける（lib/db/errors.ts・2026-09-24 検収の指摘）。一覧・日付の列・承認・承認の取り消しは
 * DB を読み書きできなければ DbAccessError を投げ、入口が 503 にする（以前は一覧が [] で「保存した書類はありません」、
 * 承認は null で 404「書類が見つかりません。」になっていた）。保存（saveDocument）の null は「保存に失敗」だけを表す。
 */

/** 保存した書類の一覧を DB から読めなかったとき、職員に見せる文（GET /api/clients/[id] が 503 で返す）。 */
export const DOCUMENTS_LOAD_FAILED_MESSAGE = dbFailedMessage(
  "保存した書類を読み込めませんでした。",
);

/** 承認・承認の取り消しを DB に書けなかったとき、職員に見せる文（PATCH /api/documents/[id] が 503 で返す）。 */
export const DOCUMENT_APPROVAL_FAILED_MESSAGE = dbFailedMessage(
  "承認の記録を変えられませんでした（変わっていません）。",
);

/**
 * 利用者一覧の「書類の日付」の列を読めなかったとき、職員に見せる文（作り直し計画 U5）。
 * getLatestDocMeta が DB を読めなければこれを publicMessage にして投げ、GET /api/clients/latest-docs は
 * 503 で、それ以外の失敗（利用者一覧を読めない等）は 500 で同じ文を返す。
 * 「書類はありません」とは言わない ── 言うと、ある書類を作り直させる（lib/db/errors.ts）。
 */
export const LATEST_DOCS_LOAD_FAILED_MESSAGE = dbFailedMessage(
  "書類の日付を読み込めませんでした。",
);

/**
 * getLatestDocMeta が1回の問い合わせで頼む行数。
 *
 * なぜ 500 か: PostgREST（Supabase）は1回の応答を上限（既定 1000 行）で**黙って**切る。上限より大きい
 * ページを頼むと、切られたページを「最後の短いページ」と取り違えて、残りを読まずに終える。上限より小さく
 * しておけば「短いページ＝本当に最後」が成り立つ（名簿の読み出しも上限が 900 行以上あることを前提にしている
 * ── lib/db/clients.ts の ALIAS_ROW_LIMIT）。
 */
const META_PAGE_SIZE = 500;

/** 利用者 id を1回の問い合わせに入れる数（URL の長さの上限のため。lib/db/clients.ts の ID_CHUNK と同じ考え）。 */
const META_ID_CHUNK = 100;

/** getLatestDocMeta が読む列だけの行（content は読まない）。 */
interface DocMetaRow {
  client_id: string;
  doc_type: CareDocumentType;
  status: CareDocumentStatus;
  created_at: string;
}

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

/**
 * 帳票を保存する（保持期限を自動付与）。status は常に draft（G4: 承認は保存後の人間操作のみ）。
 * @returns 保存した書類。書けなければ null（「保存に失敗」だけを表す。呼ぶ側は 500「保存に失敗しました。」）。
 */
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

/**
 * 指定利用者の保存帳票一覧（所有者チェック込み）。0件なら []。
 * @throws DbAccessError DB を読めなかったとき（[] にすると「保存した書類はありません」に見える）。
 */
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
  if (error) throw dbAccessError("getDocumentsByClient", error, DOCUMENTS_LOAD_FAILED_MESSAGE);
  return (data as DocRow[]).map(toRecord);
}

/**
 * 利用者一覧の「書類の種類ごとの最新日付」と「更新」の列の材料を読む（作り直し計画 U5・吉本さん決定 2026-09-23）。
 * 返すのは行の「利用者・種類・状態・保存日時」だけで、書類の中身（content）は読まない。
 *
 * 誰の書類か: **この職員が保存した書類だけ**（created_by = userId）。書類の見える範囲は getDocumentsByClient と
 * 同じで変えていない（事業所での書類の共有は権限の変更なので、別の判断 ── decisions-log 2026-09-23）。
 * そのため事業所で共有しているときも、同僚が保存した書類の日付は入らない。画面はその旨
 * 「書類の日付は、自分が保存した書類だけです」を出す（作り直しの後段）。
 * どの利用者か: 呼ぶ側（app/api/clients/latest-docs/route.ts）が getClients(scope) で範囲内の利用者だけを渡す。
 *
 * なぜページに分けて読むか: PostgREST は1回の応答を既定 1000 行で黙って切る。切られたまま返すと、
 * 書類がある種類を「まだありません」と見せてしまう。利用者 id を 100 件ずつに分け、それぞれを
 * META_PAGE_SIZE 行ずつ、満杯でないページが来るまで読み進める（並びは保存日時の新しい順＋id で固定し、
 * ページの境目で行がずれないようにする）。
 *
 * @param clientIds 範囲内の利用者の id（空なら DB に問い合わせず []）
 * @param userId ログイン中の職員（Clerk userId）。この職員が保存した書類だけを読む
 * @returns 行の一覧（0件なら []。0件は「書類が無い」だけを表す）
 * @throws DbAccessError どれか1ページでも DB を読めなかったとき（途中まで読んだ分は返さない ──
 *   返すと、読めなかった利用者の列が「まだありません」に見える）。
 */
export async function getLatestDocMeta(
  clientIds: readonly string[],
  userId: string,
): Promise<CareDocumentMeta[]> {
  if (clientIds.length === 0) return [];
  const db = createServerClient();
  const out: CareDocumentMeta[] = [];
  for (let i = 0; i < clientIds.length; i += META_ID_CHUNK) {
    const ids = clientIds.slice(i, i + META_ID_CHUNK);
    for (let from = 0; ; from += META_PAGE_SIZE) {
      const { data, error } = await db
        .from("documents")
        .select("client_id, doc_type, status, created_at")
        .in("client_id", ids)
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + META_PAGE_SIZE - 1);
      if (error || !data) {
        throw dbAccessError(
          "getLatestDocMeta",
          error ?? { message: "no data" },
          LATEST_DOCS_LOAD_FAILED_MESSAGE,
        );
      }
      const rows = data as DocMetaRow[];
      for (const r of rows) {
        out.push({
          clientId: r.client_id,
          docType: r.doc_type,
          status: r.status,
          createdAt: r.created_at,
        });
      }
      if (rows.length < META_PAGE_SIZE) break;
    }
  }
  return out;
}

/**
 * 帳票を承認する（G4: 人間操作のみ。PATCH /api/documents/[id] から呼ばれる）。
 * approved_at / approved_by を監査証跡として記録。所有者（created_by）以外・存在しない id・uuid の形でない id は
 * 更新できず null（入口は 404）。
 * @throws DbAccessError DB に書けなかったとき（null にすると「書類が見つかりません。」に見える）。
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
  if (error) {
    if (isMalformedIdError(error)) return null;
    throw dbAccessError("approveDocument", error, DOCUMENT_APPROVAL_FAILED_MESSAGE);
  }
  if (!data) return null;
  return toRecord(data as DocRow);
}

/**
 * 承認を取り消して draft に戻す（G4）。approved_at / approved_by も null に戻す。
 * 所有者（created_by）以外・存在しない id・uuid の形でない id は更新できず null（入口は 404）。
 * @throws DbAccessError DB に書けなかったとき。
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
  if (error) {
    if (isMalformedIdError(error)) return null;
    throw dbAccessError("unapproveDocument", error, DOCUMENT_APPROVAL_FAILED_MESSAGE);
  }
  if (!data) return null;
  return toRecord(data as DocRow);
}
