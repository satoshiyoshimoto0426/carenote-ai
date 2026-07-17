import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { saveDocument } from "@/lib/db/documents";
import type { CareDocumentSource, CareDocumentType } from "@/types/document";

const ALLOWED_TYPES: CareDocumentType[] = [
  "assessment",
  "carePlan",
  "meetingSummary",
  "supportLog",
  "monitoring",
];

/** 帳票を利用者に保存する（Clerkログイン）。 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const docType = body.docType as CareDocumentType;
  if (!clientId) {
    return NextResponse.json({ error: "利用者が指定されていません。" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(docType)) {
    return NextResponse.json({ error: "不明な帳票種別です。" }, { status: 400 });
  }
  if (body.content === undefined || body.content === null) {
    return NextResponse.json({ error: "保存する内容がありません。" }, { status: 400 });
  }
  const source: CareDocumentSource = body.source === "create" ? "create" : "rescue";

  // G4: 保存は常に draft（クライアントが status を送っても無視。承認は PATCH /api/documents/[id] のみ）
  const record = await saveDocument({
    userId,
    orgId: orgId ?? null,
    input: { clientId, docType, content: body.content, source },
  });
  if (!record) {
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json(record, { status: 201 });
}
