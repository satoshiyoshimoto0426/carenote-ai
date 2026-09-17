import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type DataScope, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import {
  deleteTranscript,
  getTranscriptText,
  TRANSCRIPT_TABLE_MISSING_MESSAGE,
  TranscriptTableMissingError,
} from "@/lib/db/transcripts";

/**
 * 保存した文字起こしの本文を読む／消す（docs/specs/recording-pipeline.md R4）。
 *
 * ⚠ 返す本文は**黒塗りを通っていない生の実名**を含む。AIへは渡さない。
 *   職員が画面で読み返すためだけの経路で、復号はサーバ側でしか行わない。
 *
 * 消す経路をここに置く理由: 開示・訂正・利用停止の請求に応じるとき、
 *   手作業のSQLしか無いと「消しました」と言い切れない（§2.8-B の証拠）。
 */

function scopeOf(userId: string, orgId: string | null): DataScope | null {
  try {
    return resolveScope(userId, orgId);
  } catch {
    return null;
  }
}

/** 本文を読む。 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const scope = scopeOf(userId, orgId ?? null);
  if (!scope) return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });

  const { id } = await params;
  try {
    const found = await getTranscriptText(id, scope);
    if (!found) {
      return NextResponse.json({ error: "見つかりませんでした。" }, { status: 404 });
    }
    return NextResponse.json(found);
  } catch (e) {
    if (e instanceof TranscriptTableMissingError) {
      return NextResponse.json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    // 復号に失敗した（鍵が違う・中身が壊れている）。本文は出さず、原因だけ残す
    console.error("[transcripts] read error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "保存した文字起こしを読めませんでした。管理者に連絡してください。" },
      { status: 500 },
    );
  }
}

/** 消す。 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const scope = scopeOf(userId, orgId ?? null);
  if (!scope) return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });

  const { id } = await params;
  try {
    const removed = await deleteTranscript(id, scope);
    if (!removed) {
      return NextResponse.json({ error: "見つかりませんでした。" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (e) {
    if (e instanceof TranscriptTableMissingError) {
      return NextResponse.json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, { status: 503 });
    }
    console.error("[transcripts] delete error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "消せませんでした。" }, { status: 500 });
  }
}
