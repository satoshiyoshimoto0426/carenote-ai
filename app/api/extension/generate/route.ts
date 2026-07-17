import { type NextRequest, NextResponse } from "next/server";
import {
  hitRateLimit,
  matchBearer,
  parseExtensionTokens,
  type RateState,
  resolveCorsOrigin,
} from "@/lib/extensionAuth";
import { GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/**
 * ブラウザ拡張からの生成リクエスト用エンドポイント（Clerkセッションを持たない）。
 * 認可は lib/extensionAuth（複数トークン・利用者別・env失効可・定数時間比較）。
 * CORS は認証ではなく多層防御（chrome-extension:// と許可リストのみ反射）。
 * レート制限＋監査ログでトークン漏洩時の被害（なりすまし生成・APIコスト暴走）を抑える。
 * ※ middleware.ts で /api/extension/(.*) を公開ルートにしている（Clerkの横取り回避）。
 * ※ このエンドポイントは利用者DBを読まない（返すのは入力メモからの生成結果のみ）。
 */

/** トークン単位のレート制限。サーバレスではインスタンス単位（ウォームな間）＝簡易防御。 */
const RATE_STORE = new Map<string, RateState>();
const RATE = { limit: 30, windowMs: 60_000 };

/** CORSヘッダを付与（許可オリジンのみ反射。Origin無しやガード外は付けない）。 */
function withCors(res: NextResponse, allowedOrigin: string | null): NextResponse {
  res.headers.set("Vary", "Origin");
  if (allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

/** 監査ログ（PIIを含めない: ラベル・documentType・結果のみ）。Vercelログに残る。 */
function audit(fields: Record<string, string | number>): void {
  console.log(`[extension/generate] ${JSON.stringify(fields)}`);
}

/** CORSプリフライト対応。 */
export function OPTIONS(req: NextRequest): NextResponse {
  const origin = resolveCorsOrigin(req.headers.get("origin"), process.env);
  return withCors(new NextResponse(null, { status: 204 }), origin);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const origin = resolveCorsOrigin(req.headers.get("origin"), process.env);
  const cors = (res: NextResponse) => withCors(res, origin);

  // 1) 認可: env のトークン群に一致するか（一致でラベル取得）
  const tokens = parseExtensionTokens(process.env);
  const label = matchBearer(tokens, req.headers.get("authorization"));
  if (!label) {
    audit({ result: "unauthorized", ip: req.headers.get("x-forwarded-for") ?? "?" });
    return cors(
      NextResponse.json(
        { error: "拡張の認証に失敗しました（トークンを確認してください）。" },
        { status: 401 },
      ),
    );
  }

  // 2) レート制限（トークン単位）
  const { limited } = hitRateLimit(RATE_STORE, label, Date.now(), RATE);
  if (limited) {
    audit({ result: "rate_limited", label });
    return cors(
      NextResponse.json(
        { error: "リクエストが多すぎます。しばらく待って再度お試しください。" },
        { status: 429 },
      ),
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return cors(NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 }));
  }

  try {
    const draft = await generateFromBody(body);
    audit({ result: "ok", label, documentType: String(body.documentType ?? "carePlan") });
    return cors(NextResponse.json(draft));
  } catch (e: unknown) {
    if (e instanceof GenerateRequestError) {
      audit({ result: "bad_request", label, status: e.status });
      return cors(NextResponse.json({ error: e.message }, { status: e.status }));
    }
    // 内部エラー詳細はクライアントに返さない（情報漏えい対策）。詳細はサーバログのみ。
    const detail = e instanceof Error ? e.message : String(e);
    audit({ result: "error", label });
    console.error("[extension/generate] error:", detail);
    return cors(
      NextResponse.json(
        { error: "生成に失敗しました。しばらくして再度お試しください。" },
        { status: 500 },
      ),
    );
  }
}
