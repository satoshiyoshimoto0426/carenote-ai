import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  CLIENT_LOOKUP_FAILED_MESSAGE,
  type DataScope,
  getClientById,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { saveDocument } from "@/lib/db/documents";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";
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
 * 保存する中身の入れ子の深さの上限（中身そのものを 1 段と数える）。帳票で最も深いのは
 * 第2表（CarePlanDraft → needs[] → need → services[] → service）の 5 段で、32 はその6倍余り。
 *
 * なぜ要るか（2026-09-24 検収の指摘）: 20万段の入れ子（約1.2MB）は JSON.parse では読めるが、
 * 大きさを測る JSON.stringify がスタックを使い切って RangeError になり、入口は JSON の無い 500 を返していた。
 * 保存した中身は後で再帰で読む処理（lib/draftText のコピー整形・lib/privacy の黒塗り）にも渡るので、
 * 深すぎる形は保存の入口で断る。
 */
const MAX_CONTENT_DEPTH = 32;

/**
 * 入れ子が max 段を超えるかどうか。再帰を使わず、自前の積み上げで数える（深い入力でスタックを使い切らない）。
 * 超えた時点で打ち切るので、深い入力でも見るのは max 段までの枝だけ。
 */
function exceedsDepth(root: object, max: number): boolean {
  const stack: [unknown, number][] = [[root, 1]];
  for (let top = stack.pop(); top !== undefined; top = stack.pop()) {
    const [value, depth] = top;
    if (depth > max) return true;
    const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
    for (const child of children) {
      if (child !== null && typeof child === "object") stack.push([child, depth + 1]);
    }
  }
  return false;
}

/**
 * 保存する中身の形と大きさを確かめる。帳票の下書きはどれもオブジェクト（AssessmentDraft など）なので、
 * 配列・文字列・数値は画面の不具合か画面以外からの送り込みとみなして断る。
 * 深さ（MAX_CONTENT_DEPTH）を先に確かめるので、大きさを測る JSON.stringify は深い入れ子で落ちない。
 */
function checkContent(
  content: unknown,
): { ok: true } | { ok: false; status: 400 | 413; error: string } {
  if (content === undefined || content === null) {
    return { ok: false, status: 400, error: "保存する内容がありません。" };
  }
  if (
    typeof content !== "object" ||
    Array.isArray(content) ||
    exceedsDepth(content, MAX_CONTENT_DEPTH)
  ) {
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
 * 利用者を DB から読めなかったとき（getClientById が ClientLookupError を投げる）は 404 にせず、
 * 503 と CLIENT_LOOKUP_FAILED_MESSAGE で保存しない（2026-09-24 検収の指摘）。以前は DB の失敗も 404
 * 「利用者が見つかりません。」になり、救済モードの職員が「新しい利用者として保存」で二重登録し得た。
 * 本文がオブジェクトでなければ（JSON の null・配列など）lib/requestBody.ts の readJsonObject で 400。
 *
 * 保存は常に draft（G4）: 画面が status や承認の欄を送っても読まない。承認は保存後の人間操作だけ。
 * 入口が範囲を渡すことは tests/api/orgScope.route.test.ts、この入口の決まりは
 * tests/api/documents.route.test.ts、入口をまたいだ 400／503 は tests/api/entryErrors.route.test.ts が縛る。
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

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

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

  // 見えない利用者（他の事業所の利用者・他の職員が事業所に入る前に登録した利用者・存在しない id）には保存しない。
  // DB を読めなかったときは「見つかりません」と言わない（言うと、いる利用者を新しく登録し直してしまう）
  let client: Awaited<ReturnType<typeof getClientById>>;
  try {
    client = await getClientById(clientId, scope);
  } catch (e) {
    console.error(
      "[api/documents] client lookup failed:",
      e instanceof Error ? e.message : String(e),
    );
    return NextResponse.json({ error: CLIENT_LOOKUP_FAILED_MESSAGE }, { status: 503 });
  }
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
