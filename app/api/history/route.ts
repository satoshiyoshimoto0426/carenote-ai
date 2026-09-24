import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getEvaluations } from "@/lib/db";
import { DbAccessError } from "@/lib/db/errors";

/**
 * 本人の評価の履歴を返す（Clerk ログイン）。呼ぶ画面: ダッシュボード（app/(dashboard)/dashboard/page.tsx）。
 * DB を読めなかったとき（lib/db.ts の getEvaluations が DbAccessError を投げる）は 503 と e.publicMessage。
 * 以前は [] を返し、ダッシュボードが「評価 0件」に見せていた（2026-09-24 検収の指摘）。
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getEvaluations(userId));
  } catch (e) {
    if (!(e instanceof DbAccessError)) throw e;
    return NextResponse.json({ error: e.publicMessage }, { status: 503 });
  }
}
