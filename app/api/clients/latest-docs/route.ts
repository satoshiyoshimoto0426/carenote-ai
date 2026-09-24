import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { type DataScope, getClients, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import { getLatestDocMeta, LATEST_DOCS_LOAD_FAILED_MESSAGE } from "@/lib/db/documents";
import { DbAccessError } from "@/lib/db/errors";
import { type LatestDocsResponse, summarizeLatestDocs } from "@/lib/documents/latest";

/** 職員ごと・その時点の答えなので、ブラウザにもサーバの途中にも残させない（成功も失敗も同じ）。 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

function fail(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: NO_STORE });
}

/**
 * 利用者一覧の「書類の種類ごとの最新日付」と「更新」の列を返す（Clerk ログイン・作り直し計画 U5）。
 * 画面（利用者一覧の アセス／プラン／会議／経過／モニタ／更新 の列）は作り直しの後段で繋ぐ。
 *
 * なぜ GET /api/clients と別の入口か: 日付を読めなくても、利用者の一覧そのものは出せるようにするため
 * （失敗が日付の欄だけに留まる）。画面は失敗を「—」にせず、読めなかったことを文字で出す。
 *
 * 何を返すか（lib/documents/latest.ts の LatestDocsResponse）:
 *   - 利用者: 範囲（lib/db/clients.ts の resolveScope・getClients）の中の利用者だけ。一覧と同じ並び
 *   - 書類: **この職員が保存した書類だけ**（lib/db/documents.ts の getLatestDocMeta・created_by）。
 *     事業所で共有していても同僚の書類の日付は入らない（書類の見える範囲は変えていない・吉本さん決定 2026-09-23）。
 *     書類の中身は読まず、返さない。
 *
 * 答え方:
 *   401 = ログインしていない ／ 503 = 範囲を決められない（DB に触らない。SCOPE_ERROR_MESSAGE）か、
 *   書類の行を DB から読めない（DbAccessError の publicMessage）／ 500 = 利用者一覧を読めない・日時を読めない
 *   などそのほかの失敗（LATEST_DOCS_LOAD_FAILED_MESSAGE。詳しい理由はサーバのログだけ）。
 *   どれも空の一覧は返さない ── 返すと、書類がある利用者の列が「まだありません」に見える。
 * 範囲が届くことは tests/api/orgScope.route.test.ts、答え方は tests/api/latestDocs.route.test.ts が縛る。
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return fail("ログインが必要です。", 401);
  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return fail(SCOPE_ERROR_MESSAGE, 503);
  }

  try {
    const clients = await getClients(scope);
    const rows = await getLatestDocMeta(
      clients.map((c) => c.id),
      scope.userId,
    );
    const body: LatestDocsResponse = { clients: summarizeLatestDocs(clients, rows) };
    return NextResponse.json(body, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof DbAccessError) return fail(e.publicMessage, 503);
    // 日付の欄が出ない＝どの書類がいつかを一覧で追えない。原因を追えるようにサーバのログへ残す（画面へは出さない）
    console.error(
      "[api/clients/latest-docs] GET failed:",
      e instanceof Error ? e.message : String(e),
    );
    return fail(LATEST_DOCS_LOAD_FAILED_MESSAGE, 500);
  }
}
