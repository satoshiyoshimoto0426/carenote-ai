import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  CLIENT_LOOKUP_FAILED_MESSAGE,
  type DataScope,
  getClientById,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { getDocumentsByClient } from "@/lib/db/documents";

/**
 * 利用者1件＋その保存帳票を返す（範囲チェック込み）。呼ぶ画面: app/(dashboard)/clients/[id]/page.tsx。
 * 見えるかどうかは lib/db/clients.ts の getClientById（名簿と同じ範囲）で決め、見えなければ 404。
 * DB を読めなかったとき（ClientLookupError）は 404 にせず 503 と CLIENT_LOOKUP_FAILED_MESSAGE ──
 * 「見つかりません」と出すと、いる利用者を新しく登録し直させてしまう（2026-09-24 検収の指摘）。
 */
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
  let client: Awaited<ReturnType<typeof getClientById>>;
  try {
    client = await getClientById(id, scope);
  } catch (e) {
    console.error("[api/clients/[id]] lookup failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: CLIENT_LOOKUP_FAILED_MESSAGE }, { status: 503 });
  }
  if (!client) return NextResponse.json({ error: "利用者が見つかりません。" }, { status: 404 });

  const documents = await getDocumentsByClient(id, userId);
  return NextResponse.json({ client, documents });
}
