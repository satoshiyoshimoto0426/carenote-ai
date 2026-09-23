import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type DataScope, getClientById, resolveScope, SCOPE_ERROR_MESSAGE } from "@/lib/db/clients";
import { saveDocument } from "@/lib/db/documents";
import type { CareDocumentSource, CareDocumentType } from "@/types/document";

const ALLOWED_TYPES: CareDocumentType[] = [
  "assessment",
  "carePlan",
  "meetingSummary",
  "supportLog",
  "monitoring",
];

/**
 * 保存する中身（content）の上限。JSON にしたときの UTF-8 のバイト数で数える（日本語は1字3バイト）。
 * AI の返事は1回あたり最大 16000 トークン（lib/generation/structured.ts）で、帳票1枚は JSON にして
 * 数十KB に収まる。200KB はその数倍の余裕を残しつつ、画面を通さずに巨大な JSON を送り込んで
 * 保存書類の表（5年保持）を膨らませる使い方を止める。
 */
const MAX_CONTENT_BYTES = 200 * 1024;

/**
 * 保存する中身の形と大きさを確かめる。帳票の下書きはどれもオブジェクト（AssessmentDraft など）なので、
 * 配列・文字列・数値は画面の不具合か画面以外からの送り込みとみなして断る。
 */
function checkContent(
  content: unknown,
): { ok: true } | { ok: false; status: 400 | 413; error: string } {
  if (content === undefined || content === null) {
    return { ok: false, status: 400, error: "保存する内容がありません。" };
  }
  if (typeof content !== "object" || Array.isArray(content)) {
    return { ok: false, status: 400, error: "保存する内容の形が正しくありません。" };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(content)).byteLength;
  if (bytes > MAX_CONTENT_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "保存する内容が大きすぎます。下書きを短くしてからお試しください。",
    };
  }
  return { ok: true };
}

/**
 * 帳票の下書きを利用者に保存する（Clerk ログイン）。呼ぶ画面は救済モード（source: "rescue"）と、
 * 今後のつくる（source: "create"）。保存したものは利用者ページ（GET /api/clients/[id]）に並び、
 * 承認は PATCH /api/documents/[id] の人間操作だけで付く。
 *
 * なぜこの順で確かめるか（作り直し計画 S1・2026-09-23）:
 *   以前は Clerk の orgId をそのまま保存し、**保存先の利用者が本人に見えるかを確かめていなかった**。
 *   利用者の id さえ分かれば、他の事業所の利用者に書類を紐づけられた。いまは名簿と同じ範囲
 *   （lib/db/clients.ts の resolveScope → getClientById）で見える利用者だけに保存し、見えなければ 404。
 *   範囲を決められないログイン情報は、DB に触る前に 503 で止める（他の入口と同じ形）。
 *
 * 保存は常に draft（G4）: 画面が status や承認の欄を送っても読まない。承認は保存後の人間操作だけ。
 * 入口が範囲を渡すことは tests/api/orgScope.route.test.ts、この入口の決まりは
 * tests/api/documents.route.test.ts が縛る。
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

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  const docType = body.docType as CareDocumentType;
  if (!clientId) {
    return NextResponse.json({ error: "利用者が指定されていません。" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(docType)) {
    return NextResponse.json({ error: "不明な帳票種別です。" }, { status: 400 });
  }
  const check = checkContent(body.content);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  const source: CareDocumentSource = body.source === "create" ? "create" : "rescue";

  // 見えない利用者（他の事業所の利用者・他の職員が事業所に入る前に登録した利用者・存在しない id）には保存しない
  const client = await getClientById(clientId, scope);
  if (!client) return NextResponse.json({ error: "利用者が見つかりません。" }, { status: 404 });

  // G4: 保存は常に draft（クライアントが status を送っても無視。承認は PATCH /api/documents/[id] のみ）
  const record = await saveDocument({
    userId,
    orgId: scope.orgId,
    input: { clientId, docType, content: body.content, source },
  });
  if (!record) {
    return NextResponse.json({ error: "保存に失敗しました。" }, { status: 500 });
  }
  return NextResponse.json(record, { status: 201 });
}
