import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { createClientRecord, getClients } from "@/lib/db/clients";
import type { ClientAttributes } from "@/types/client";

/** 利用者の一覧取得・作成（Webアプリ・Clerkログイン）。 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  return NextResponse.json(await getClients(userId));
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : undefined;
  const attributes =
    body.attributes && typeof body.attributes === "object"
      ? (body.attributes as ClientAttributes)
      : undefined;

  const record = await createClientRecord({
    userId,
    orgId: orgId ?? null,
    input: { name, attributes },
  });
  if (!record) {
    return NextResponse.json({ error: "利用者の作成に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json(record, { status: 201 });
}
