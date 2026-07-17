import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/** Webアプリ（Clerkログイン）からの生成リクエスト。 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  try {
    const draft = await generateFromBody(body);
    return NextResponse.json(draft);
  } catch (e: unknown) {
    if (e instanceof GenerateRequestError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // 内部エラー詳細はクライアントに返さない（情報漏えい対策）。詳細はサーバログのみ。
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[generate] error:", detail);
    return NextResponse.json(
      { error: "生成に失敗しました。しばらくして再度お試しください。" },
      { status: 500 },
    );
  }
}
