import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { type DataScope, getClientById, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import { getDocumentsByClient } from "@/lib/db/documents";

/** 利用者1件＋その保存帳票を返す（所有者チェック込み）。 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }

  const { id } = await params;
  const client = await getClientById(id, scope);
  if (!client) return NextResponse.json({ error: "利用者が見つかりません。" }, { status: 404 });

  const documents = await getDocumentsByClient(id, userId);
  return NextResponse.json({ client, documents });
}
