import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  addRelatedPerson,
  CLIENT_LOOKUP_FAILED_MESSAGE,
  ClientLookupError,
  type DataScope,
  deleteRelatedPerson,
  getRelatedPeople,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

/**
 * 関係者名簿（D4）: 家族・担当者・主治医などを利用者ごとに登録し、黒塗りの対象にする。
 * 実名は暗号化保存。ここで返す実名はログイン職員の画面表示用で、AIへは渡さない。
 * 呼ぶ画面: components/clients/RelatedPeople.tsx。
 *
 * 親の利用者を DB から読めなかったとき（lib/db/clients.ts の ClientLookupError）は、3つとも
 * 503 と CLIENT_LOOKUP_FAILED_MESSAGE を返す（2026-09-24 検収の指摘）。空の一覧や「見つかりません」と
 * 答えると、登録済みの家族を登録し直させたり、消えていないのに「もう無い」と伝えたりする。
 */
type Ctx = { params: Promise<{ id: string }> };

/** 親の利用者を読めなかったときの答え。それ以外の例外はそのまま投げ直す（握りつぶさない）。 */
function lookupFailed(e: unknown): NextResponse {
  if (!(e instanceof ClientLookupError)) throw e;
  console.error("[api/clients/[id]/related] lookup failed:", e.message);
  return NextResponse.json({ error: CLIENT_LOOKUP_FAILED_MESSAGE }, { status: 503 });
}

/** 関係者の一覧（実名つき・画面表示用）。 */
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
  try {
    return NextResponse.json(await getRelatedPeople(id, scope), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return lookupFailed(e);
  }
}

/** 関係者を1人登録する。本文 = { relation, name }。 */
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

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });
  const relation = typeof body.relation === "string" ? body.relation : "";
  const name = typeof body.name === "string" ? body.name : "";

  let r: Awaited<ReturnType<typeof addRelatedPerson>>;
  try {
    r = await addRelatedPerson({
      clientId: id,
      userId: scope.userId,
      orgId: scope.orgId,
      relation,
      name,
    });
  } catch (e) {
    return lookupFailed(e);
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ id: r.id }, { status: 201 });
}

/** 関係者を1人消す。?relatedId= で指定する。 */
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
  let r: Awaited<ReturnType<typeof deleteRelatedPerson>>;
  try {
    r = await deleteRelatedPerson(relatedId, id, scope);
  } catch (e) {
    return lookupFailed(e);
  }
  if (r === "error") return NextResponse.json({ error: "削除に失敗しました。" }, { status: 500 });
  if (r === "not_found") {
    return NextResponse.json(
      { error: "対象が見つかりません（既に削除済みか、権限がありません）。" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
