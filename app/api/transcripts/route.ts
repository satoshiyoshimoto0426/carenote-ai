import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type DataScope, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import { getTranscriptsByClient, saveTranscript } from "@/lib/db/transcripts";
import { checkTranscriptInput } from "@/lib/privacy/transcriptInput";

/**
 * 文字起こし全文の保存と一覧（docs/specs/recording-pipeline.md R4）。
 *
 * ⚠ ここで扱う本文は**黒塗りを通っていない生の実名**を含む。AIへは絶対に渡さない。
 *   用途は職員が画面で読み返すことだけ。保存は暗号化して行う（lib/db/transcripts）。
 *
 * 誰が読めるか: 親の利用者が見える人だけ（判定は getClientById に一本化）。
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

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
    if (!saved) {
      return NextResponse.json(
        { error: "保存できませんでした。選んだ利用者が見つからないか、権限がありません。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ transcript: saved });
  } catch (e) {
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

  const transcripts = await getTranscriptsByClient(clientId, scope);
  return NextResponse.json({ transcripts });
}
