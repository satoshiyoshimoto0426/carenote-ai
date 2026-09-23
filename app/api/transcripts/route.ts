import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type DataScope, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import { DbAccessError } from "@/lib/db/errors";
import {
  getTranscriptsByClient,
  saveTranscript,
  TRANSCRIPT_TABLE_MISSING_MESSAGE,
  TranscriptTableMissingError,
} from "@/lib/db/transcripts";
import { checkTranscriptInput } from "@/lib/privacy/transcriptInput";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

/**
 * 文字起こし全文の保存と一覧（docs/specs/recording-pipeline.md R4）。
 *
 * ⚠ ここで扱う本文は**黒塗りを通っていない生の実名**を含む。AIへは絶対に渡さない。
 *   用途は職員が画面で読み返すことだけ。保存は暗号化して行う（lib/db/transcripts）。
 *
 * 誰が読めるか: 親の利用者が見える人だけ（判定は getClientById に一本化）。
 * 親の利用者を DB から読めなかったとき（ClientLookupError）は 503 と CLIENT_LOOKUP_FAILED_MESSAGE
 * （「見つからない・権限がない」と答えない ── 2026-09-24 検収の指摘）。一覧そのものを読めなかったときも
 * 503 と「一覧を読み込めませんでした」（lib/db/transcripts.ts が DbAccessError を投げる。以前は空の一覧だった）。
 * どちらも lib/db/errors.ts の DbAccessError として受け、職員には e.publicMessage だけを返す。
 */

function scopeOf(userId: string, orgId: string | null): DataScope | null {
  try {
    return resolveScope(userId, orgId);
  } catch {
    return null;
  }
}

/** 保存する。 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const scope = scopeOf(userId, orgId ?? null);
  if (!scope) return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "保存先の利用者を選んでください。" }, { status: 400 });
  }

  const check = checkTranscriptInput(body);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  try {
    const saved = await saveTranscript({
      clientId,
      kind: check.kind,
      title: check.title,
      text: check.text,
      userId,
      scope,
    });
    if (!saved.ok) {
      // 「利用者が見えない」と「保存に失敗」を取り違えない（独立審査 2026-09-17）
      if (saved.reason === "client_not_visible") {
        return NextResponse.json(
          { error: "選んだ利用者が見つからないか、権限がありません。" },
          { status: 404 },
        );
      }
      return NextResponse.json({ error: "保存できませんでした。" }, { status: 500 });
    }
    return NextResponse.json({ transcript: saved.transcript });
  } catch (e) {
    if (e instanceof TranscriptTableMissingError) {
      return NextResponse.json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    if (e instanceof DbAccessError) {
      console.error("[transcripts] save: db failed:", e.message);
      return NextResponse.json({ error: e.publicMessage }, { status: 503 });
    }
    // 本文はログに出さない（出すと暗号化した意味が消える）
    console.error("[transcripts] save error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }
}

/** 一覧を返す（本文は含めない）。 */
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const scope = scopeOf(userId, orgId ?? null);
  if (!scope) return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });

  const clientId = req.nextUrl.searchParams.get("clientId") ?? "";
  if (!clientId) {
    return NextResponse.json({ error: "利用者が指定されていません。" }, { status: 400 });
  }

  try {
    const transcripts = await getTranscriptsByClient(clientId, scope);
    return NextResponse.json({ transcripts });
  } catch (e) {
    if (e instanceof TranscriptTableMissingError) {
      return NextResponse.json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    if (e instanceof DbAccessError) {
      console.error("[transcripts] list: db failed:", e.message);
      return NextResponse.json({ error: e.publicMessage }, { status: 503 });
    }
    console.error("[transcripts] list error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "一覧を取れませんでした。" }, { status: 500 });
  }
}
