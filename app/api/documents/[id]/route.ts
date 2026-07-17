import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { approveDocument, unapproveDocument } from "@/lib/db/documents";

/**
 * 帳票の承認・承認取消（G4 承認モデル）。人間の明示操作でのみ status が変わる。
 * body: {action:"approve"|"unapprove"}。所有者（created_by）以外・存在しない id は404。
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "unapprove") {
    return NextResponse.json(
      { error: "action は approve または unapprove を指定してください。" },
      { status: 400 },
    );
  }

  const { id } = await params;
  const record =
    action === "approve" ? await approveDocument(id, userId) : await unapproveDocument(id, userId);
  if (!record) {
    return NextResponse.json({ error: "書類が見つかりません。" }, { status: 404 });
  }
  return NextResponse.json(record);
}
