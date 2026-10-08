import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  AliasLoadError,
  type DataScope,
  getClientAliases,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { assertInputSize, GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskRequestBody } from "@/lib/privacy/maskBody";
import { createPiiVault, restoreDeep } from "@/lib/privacy/vault";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";
import { isOpenPilotAt } from "@/lib/supportPlan/edition";
import {
  clientIpOf,
  GUEST_PLAN_DAILY_LIMIT,
  GUEST_PLAN_HOURLY_PER_IP,
  guestRequestProblem,
  isGuestPlanRequest,
  newGuestQuotaStore,
  pickGuestPlanFields,
  releaseGuestTurn,
  takeGuestTurn,
} from "@/lib/supportPlan/guestAccess";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/** ログインなしの試行版で、ログインしていない人の原案づくりを数える置き場（lib/supportPlan/guestAccess.ts） */
const guestPlans = newGuestQuotaStore();

/**
 * Webアプリ（Clerkログイン）からの生成リクエスト。
 * ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open）に限り、ログインしていない人の計画書づくり
 * （documentType "supportPlanA"）も受け付ける ── 名簿は使わず（試行版は名簿を持たない）、黒塗りの型の置換と
 * 漏れ検査はそのまま通し、AI の回数を1日 GUEST_PLAN_DAILY_LIMIT 回までに絞る（2026-10-05 吉本さんの決定）。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  // 本番の名前（carenote-ai.vercel.app など）では、印が open でもログインなしにしない（edition.ts の isOpenPilotAt）
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

  const parsed = await readJsonObject(req);
  if (!parsed) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });
  let body: Record<string, unknown> = parsed;
  // ログインしていない人に許すのは、試行版の計画書づくりだけ（CareNote の書類はログインが要る）
  const guest = !scope && isGuestPlanRequest(userId, body.documentType, open);
  if (!scope && !guest) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  // ゲストは使う欄だけを残す（中身の無い欄を大量に並べて黒塗りの計算を使わせない ── 再審査 中1）
  if (guest) body = pickGuestPlanFields(body);
  // 大きさは黒塗りの**前**に調べる。黒塗りは文の長さに応じて時間がかかるので、上限を超えた文を黒塗りに通すと
  // それだけで計算の枠を使える（独立審査 2026-10-08 重大1）。上限は AI へ送る時と同じ（dispatch.ts）
  try {
    assertInputSize(body);
  } catch (e) {
    if (e instanceof GenerateRequestError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  // 黒塗り（SPEC §7・docs/specs/call-pipeline.md §2.1）: 名簿置換→型置換→自己点検を maskPii で
  // 一括適用してからAIへ送る。名簿が空でも型置換は動く。残っていれば 422 で送信を中止（fail-closed）。
  // 第一の防御は「メモに実名を書かない」運用で、これはその安全網。documentType は対象外。
  // 二枚方式（§2.5）: 型置換の元の値はリクエスト内の札入れが覚え、AIの返事で手元に戻す。
  // /api/preview と同じ maskRequestBody を通す（画面で見せた文章とAIに送る文章を一致させる）。
  // 名簿が読めなければ送らない（fail-closed）。名簿なしで進むと実名が消えないまま AI へ出る。
  // ゲスト（試行版）は名簿を持たないので空 ── 名前は置き換わらない。送る前の画面で人が確かめる（README §3）
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
  const vault = createPiiVault();
  const masked = { names: 0, patterns: 0 };
  try {
    const r = maskRequestBody(body, aliases, vault);
    body = r.body;
    masked.names = r.findings.names;
    masked.patterns = r.findings.patterns.reduce((s, f) => s + f.count, 0);
  } catch (e) {
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
  // 件数のみ記録する（本文・原文はログに出さない）
  if (masked.names + masked.patterns > 0) console.info("[generate] pii masked", masked);

  // ゲストの回数は AI へ送る直前に数える（黒塗りで止まったものは数えない）
  if (guest) {
    const turn = takeGuestTurn(guestPlans, clientIpOf(req.headers), Date.now(), {
      daily: GUEST_PLAN_DAILY_LIMIT,
      perIpHourly: GUEST_PLAN_HOURLY_PER_IP,
      label: "原案づくり",
      dailyText: `${GUEST_PLAN_DAILY_LIMIT}回`,
    });
    if (!turn.ok) return NextResponse.json({ error: turn.error }, { status: 429 });
  }

  try {
    const draft = await generateFromBody(body);
    // AIの返事に残る札（〔電話番号1〕等）を手元で元の値に戻してから返す（名前の記号はそのまま）。
    // 予定（appointments）はカレンダーへ渡すので戻さない（不変条件⑥「記号＋用件のみ」・独立審査 D22）
    return NextResponse.json(restoreDeep(draft, vault, { skipKeys: ["appointments"] }));
  } catch (e: unknown) {
    if (e instanceof GenerateRequestError) {
      // 頼みの中身の誤り（長すぎる・欄が無い）は AI を呼ぶ前に止まる ── ゲストの1回を戻す
      if (guest) releaseGuestTurn(guestPlans, Date.now());
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // 内部エラー詳細はクライアントに返さない（情報漏えい対策）。詳細はサーバログのみ。
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[generate] error:", detail);
    // AI会社側の利用枠不足は職員が直せない事象なので、原因が分かる言葉で返す（2026-09-09 実機で発生）
    if (/credit balance/i.test(detail)) {
      return NextResponse.json(
        {
          error:
            "AI会社（Anthropic）の利用枠が不足しています。管理者に「Plans & Billing で残高の追加」を依頼してください。",
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      { error: "生成に失敗しました。しばらくして再度お試しください。" },
      { status: 500 },
    );
  }
}
