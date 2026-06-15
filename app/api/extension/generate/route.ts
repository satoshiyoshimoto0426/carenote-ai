import { type NextRequest, NextResponse } from "next/server";
import { GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/**
 * ブラウザ拡張からの生成リクエスト用エンドポイント。
 * Clerkセッションを持たない拡張のため、共有トークン（Bearer認証）で認可する。
 * 環境変数 CARENOTE_EXTENSION_TOKEN と一致する場合のみ生成を許可する。
 */

/** 拡張(chrome-extension://...)からのfetchを許可するCORSヘッダ。トークン保護のため * で許可。 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS_HEADERS)) {
    res.headers.set(k, v);
  }
  return res;
}

/** Bearerトークンを検証する。サーバ側でトークン未設定の場合は常に不許可。 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CARENOTE_EXTENSION_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && token === expected;
}

/** CORSプリフライト対応。 */
export function OPTIONS(): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return withCors(
      NextResponse.json(
        { error: "拡張の認証に失敗しました（トークンを確認してください）。" },
        { status: 401 },
      ),
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return withCors(
      NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 }),
    );
  }

  try {
    const draft = await generateFromBody(body);
    return withCors(NextResponse.json(draft));
  } catch (e: unknown) {
    if (e instanceof GenerateRequestError) {
      return withCors(NextResponse.json({ error: e.message }, { status: e.status }));
    }
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[extension/generate] error:", message);
    return withCors(NextResponse.json({ error: message }, { status: 500 }));
  }
}
