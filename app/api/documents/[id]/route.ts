import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { approveDocument, unapproveDocument } from "@/lib/db/documents";
import { DbAccessError } from "@/lib/db/errors";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

/**
 * 帳票の承認・承認取消（G4 承認モデル）。人間の明示操作でのみ status が変わる。呼ぶ画面: 利用者の詳細（/clients/[id]）。
 * body: {action:"approve"|"unapprove"}。所有者（created_by）以外・存在しない id は404。
 * DB に書けなかったとき（lib/db/documents.ts が DbAccessError を投げる）は 404 にせず 503 と e.publicMessage
 * （以前は DB の失敗も「書類が見つかりません。」だった ── 2026-09-24 検収の指摘）。
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  const action = body.action;
  if (action !== "approve" && action !== "unapprove") {
    return NextResponse.json(
      { error: "action は approve または unapprove を指定してください。" },
      { status: 400 },
    );
  }

  const { id } = await params;
  let record: Awaited<ReturnType<typeof approveDocument>>;
  try {
    record =
      action === "approve"
        ? await approveDocument(id, userId)
        : await unapproveDocument(id, userId);
  } catch (e) {
    if (!(e instanceof DbAccessError)) throw e;
    return NextResponse.json({ error: e.publicMessage }, { status: 503 });
  }
  if (!record) {
    return NextResponse.json({ error: "書類が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json(record);
}
