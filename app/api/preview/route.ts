import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { AliasLoadError, getClientAliases } from "@/lib/db/clients";
import { findNameCandidates, type NameCandidate } from "@/lib/privacy/candidates";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskRequestBody } from "@/lib/privacy/maskBody";
import { createPiiVault } from "@/lib/privacy/vault";

/**
 * 送る前に見る（docs/specs/call-pipeline.md 第2段）。
 * /api/generate と同じ黒塗りを通した本文を返すだけで、AIへは送らない。
 * 名前っぽいのに消せなかった言葉を候補として添え、画面で赤く示す。
 */
export interface PreviewResponse {
  fields: Record<string, string>;
  findings: { names: number; patterns: { kind: string; count: number }[] };
  candidates: Record<string, NameCandidate[]>;
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  // 名簿が読めなければ確認画面も出さない（実名が残った文章を「送っていい」と見せないため）
  let aliases: Awaited<ReturnType<typeof getClientAliases>>;
  try {
    aliases = await getClientAliases({ userId, orgId: orgId ?? null });
  } catch (e) {
    if (e instanceof AliasLoadError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
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
