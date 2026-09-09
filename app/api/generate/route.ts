import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { getClientAliases } from "@/lib/db/clients";
import { GenerateRequestError, generateFromBody } from "@/lib/generation/dispatch";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskPii } from "@/lib/privacy/maskPii";

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

  // 黒塗り（SPEC §7・docs/specs/call-pipeline.md §2.1）: 名簿置換→型置換→自己点検を maskPii で
  // 一括適用してからAIへ送る。名簿が空でも型置換は動く。残っていれば 422 で送信を中止（fail-closed）。
  // 第一の防御は「メモに実名を書かない」運用で、これはその安全網。documentType は対象外。
  const aliases = await getClientAliases(userId);
  const masked = { names: 0, patterns: 0 };
  try {
    for (const [key, value] of Object.entries(body)) {
      if (key !== "documentType" && typeof value === "string") {
        const r = maskPii(value, aliases);
        body[key] = r.text;
        masked.names += r.findings.names;
        masked.patterns += r.findings.patterns.reduce((s, f) => s + f.count, 0);
      }
    }
  } catch (e) {
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }
  // 件数のみ記録する（本文・原文はログに出さない）
  if (masked.names + masked.patterns > 0) console.info("[generate] pii masked", masked);

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
