import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  addRelatedPerson,
  type DataScope,
  deleteRelatedPerson,
  getRelatedPeople,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";

/**
 * 関係者名簿（D4）: 家族・担当者・主治医などを利用者ごとに登録し、黒塗りの対象にする。
 * 実名は暗号化保存。ここで返す実名はログイン職員の画面表示用で、AIへは渡さない。
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }
  const { id } = await params;
  return NextResponse.json(await getRelatedPeople(id, scope), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }
  const { id } = await params;

  let body: { relation?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }
  const relation = typeof body.relation === "string" ? body.relation : "";
  const name = typeof body.name === "string" ? body.name : "";

  const r = await addRelatedPerson({
    clientId: id,
    userId: scope.userId,
    orgId: scope.orgId,
    relation,
    name,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ id: r.id }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }
  const { id } = await params;
  const relatedId = req.nextUrl.searchParams.get("relatedId") ?? "";
  if (!relatedId)
    return NextResponse.json({ error: "対象が指定されていません。" }, { status: 400 });
  const r = await deleteRelatedPerson(relatedId, id, scope);
  if (r === "error") return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  if (r === "not_found") {
    return NextResponse.json(
      { error: "対象が見つかりません（既に削除済みか、権限がありません）。" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
