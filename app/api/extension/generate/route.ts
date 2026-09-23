import { type NextRequest, NextResponse } from "next/server";
import {
  hitRateLimit,
  matchBearer,
  parseExtensionTokens,
  type RateState,
  resolveCorsOrigin,
} from "@/lib/extensionAuth";
import { GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskRequestBody } from "@/lib/privacy/maskBody";
import { createPiiVault, restoreDeep } from "@/lib/privacy/vault";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/**
 * ブラウザ拡張からの生成リクエスト用エンドポイント（Clerkセッションを持たない）。
 * 認可は lib/extensionAuth（複数トークン・利用者別・env失効可・定数時間比較）。
 * CORS は認証ではなく多層防御（chrome-extension:// と許可リストのみ反射）。
 * レート制限＋監査ログでトークン漏洩時の被害（なりすまし生成・APIコスト暴走）を抑える。
 * ※ middleware.ts で /api/extension/(.*) を公開ルートにしている（Clerkの横取り回避）。
 * ※ このエンドポイントは利用者DBを読まない（返すのは入力メモからの生成結果のみ）。
 * ※ 黒塗り（独立審査 2026-09-11 D5/D25）: 名簿は読めないが、型置換（電話・住所・生年月日・番号）と
 *    漏れ検査は名簿なしで動くので必ず通す。実名の記号化は無いため、拡張の画面は「実名を書かない」運用が前提
 *    （docs/DATA-HANDLING-EXPLANATION.md §3 に明記）。
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

/**
 * 拡張からの生成（上の説明のとおり Clerk ではなくトークンで認可）。順番は ①トークン(401) ②回数の上限(429)
 * ③本文（lib/requestBody.ts の readJsonObject。オブジェクトでなければ 400）④名簿なしの黒塗り（残れば 422）⑤生成。
 */
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

  const parsed = await readJsonObject(req);
  if (!parsed) {
    return cors(NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 }));
  }
  let body: Record<string, unknown> = parsed;

  // 名簿なしの黒塗り（型置換＋漏れ検査）。残っていれば 422 で止める（fail-closed）
  const vault = createPiiVault();
  try {
    body = maskRequestBody(body, [], vault).body;
  } catch (e) {
    if (e instanceof PiiLeakError) {
      audit({ result: "pii_leak", label });
      return cors(NextResponse.json({ error: e.message }, { status: 422 }));
    }
    throw e;
  }

  try {
    const draft = await generateFromBody(body);
    audit({ result: "ok", label, documentType: String(body.documentType ?? "carePlan") });
    return cors(NextResponse.json(restoreDeep(draft, vault, { skipKeys: ["appointments"] })));
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
