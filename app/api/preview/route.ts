import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  AliasLoadError,
  type DataScope,
  getClientAliases,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { hitRateLimit, type RateState } from "@/lib/extensionAuth";
import { assertInputSize, GenerateRequestError } from "@/lib/generation/dispatch";
import { findNameCandidates, type NameCandidate } from "@/lib/privacy/candidates";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskRequestBody } from "@/lib/privacy/maskBody";
import { createPiiVault } from "@/lib/privacy/vault";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";
import { isOpenPilotAt } from "@/lib/supportPlan/edition";
import {
  clientIpOf,
  GUEST_PLAN_FIELDS,
  GUEST_PREVIEW_HOURLY_PER_IP,
  guestRequestProblem,
  isGuestPlanRequest,
} from "@/lib/supportPlan/guestAccess";

/** ログインなしの試行版で、ログインしていない人の「送る前の確認」を IP ごとに数える置き場（サーバーの実体ごとの記憶） */
const guestPreviews = new Map<string, RateState>();

/**
 * 送る前に見る（docs/specs/call-pipeline.md 第2段）。
 * /api/generate と同じ黒塗りを通した本文を返すだけで、AIへは送らない。
 * 名前っぽいのに消せなかった言葉を候補として添え、画面で赤く示す。
 */
/** AI を呼ばない（黒塗りだけ）ので短くてよい。長い処理で計算の枠を使わせない（独立審査 2026-10-08 重大1） */
export const maxDuration = 30;

export interface PreviewResponse {
  fields: Record<string, string>;
  findings: { names: number; patterns: { kind: string; count: number }[] };
  candidates: Record<string, NameCandidate[]>;
}

/**
 * 送る前の画面（components/drafts/PreSendPreview）へ、黒塗り後の本文と「名前らしい語」の候補を返す。
 * 順番は /api/generate と同じ（ログイン → 範囲 → 本文 → 名簿 → 黒塗り）で、AI へは送らない。
 * 本文がオブジェクトでなければ lib/requestBody.ts の readJsonObject で 400、名簿が読めなければ 503。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  // 本番の名前では、印が open でもログインなしにしない（edition.ts の isOpenPilotAt）
  const open = isOpenPilotAt(req.nextUrl.hostname);
  if (!userId && !open) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  // ゲストは、試行版の画面そのものからの JSON の頼みだけ（別のサイトに来た人のブラウザを使わせない）
  if (!userId) {
    const problem = guestRequestProblem(req.headers, "json");
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });
  }

  let scope: DataScope | null = null;
  if (userId) {
    try {
      scope = resolveScope(userId, orgId);
    } catch {
      return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
    }
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });
  // ログインしていない人に許すのは、ログインなしの試行版の計画書づくりだけ（lib/supportPlan/guestAccess.ts）。
  // AI は呼ばないので回数は数えない（数えるのは /api/generate）。
  if (!scope && !isGuestPlanRequest(userId, body.documentType, open)) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  if (!scope) {
    // ゲストは使う欄だけを残し、同じ IP からの回数も絞る（AI は呼ばないが、黒塗りの計算を何回でも使わせない ── 再審査 中1・重大A）
    for (const k of Object.keys(body)) if (!GUEST_PLAN_FIELDS.includes(k)) delete body[k];
    const rate = hitRateLimit(guestPreviews, clientIpOf(req.headers), Date.now(), {
      limit: GUEST_PREVIEW_HOURLY_PER_IP,
      windowMs: 60 * 60 * 1000,
    });
    if (rate.limited) {
      return NextResponse.json(
        {
          error:
            "短い時間に続けて送る前の確認が使われたため、少し止めています。1時間ほど空けてから、もう一度お試しください。",
        },
        { status: 429 },
      );
    }
  }
  // 大きさは黒塗りの**前**に調べる（/api/generate と同じ上限。黒塗りは長さに応じて時間がかかるので、
  // 上限の無い文を通すと計算の枠を使い切れた ── 独立審査 2026-10-08 重大1）
  try {
    assertInputSize(body);
  } catch (e) {
    if (e instanceof GenerateRequestError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // 名簿が読めなければ確認画面も出さない（実名が残った文章を「送っていい」と見せないため）。
  // ゲスト（試行版）は名簿を持たないので空 ── 名前は置き換わらず、名前らしい語は赤い候補として人に見せる
  let aliases: Awaited<ReturnType<typeof getClientAliases>> = [];
  if (scope) {
    try {
      aliases = await getClientAliases(scope);
    } catch (e) {
      if (e instanceof AliasLoadError)
        return NextResponse.json({ error: e.message }, { status: 503 });
      throw e;
    }
  }
  try {
    const masked = maskRequestBody(body, aliases, createPiiVault());
    const candidates: Record<string, NameCandidate[]> = {};
    for (const [key, text] of Object.entries(masked.fields)) {
      const c = findNameCandidates(text);
      if (c.length > 0) candidates[key] = c;
    }
    const res: PreviewResponse = { fields: masked.fields, findings: masked.findings, candidates };
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[preview] error:", detail);
    return NextResponse.json({ error: "確認用の文章を作れませんでした。" }, { status: 500 });
  }
}
