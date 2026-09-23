import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { CLIENT_LIST_LOAD_FAILED_MESSAGE } from "@/lib/clients/listError";
import {
  createClientRecord,
  type DataScope,
  getClients,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import type { ClientAttributes } from "@/types/client";

/**
 * 利用者の一覧（Webアプリ・Clerkログイン）。範囲は lib/db/clients.ts の resolveScope で決める。
 *
 * DB を読めなかったら 500 と職員向けの文言（CLIENT_LIST_LOAD_FAILED_MESSAGE）を返し、空の一覧 [] は返さない。
 * なぜ: [] を返すと画面が「まだ利用者がいません」と出し、救済モードの保存で同じ方を二重に登録できた
 * （2026-09-23 作り直し計画 U0）。使う画面は lib/clients/listError.ts の fetchClientList で読む。
 * DB の詳しい理由はサーバのログにだけ残し、画面へは出さない。
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }
  try {
    return NextResponse.json(await getClients(scope));
  } catch (e) {
    // 職員が一覧を開けない＝業務が止まる。原因を追えるようにサーバのログへ残す
    console.error("[api/clients] GET failed:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: CLIENT_LIST_LOAD_FAILED_MESSAGE }, { status: 500 });
  }
}

/**
 * 利用者を登録する（Webアプリ・Clerkログイン）。記号（A様）は lib/db/clients.ts の createClientRecord が
 * 範囲内で採番し、氏名は暗号化して client_identities に置く。呼ぶ画面: /clients の新規登録・/rescue の保存。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }

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
    userId: scope.userId,
    orgId: scope.orgId,
    input: { name, attributes },
  });
  if (!record) {
    return NextResponse.json({ error: "利用者の作成に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json(record, { status: 201 });
}
