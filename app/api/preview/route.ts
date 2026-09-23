import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  AliasLoadError,
  type DataScope,
  getClientAliases,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import { findNameCandidates, type NameCandidate } from "@/lib/privacy/candidates";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskRequestBody } from "@/lib/privacy/maskBody";
import { createPiiVault } from "@/lib/privacy/vault";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

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

/**
 * 送る前の画面（components/drafts/PreSendPreview）へ、黒塗り後の本文と「名前らしい語」の候補を返す。
 * 順番は /api/generate と同じ（ログイン → 範囲 → 本文 → 名簿 → 黒塗り）で、AI へは送らない。
 * 本文がオブジェクトでなければ lib/requestBody.ts の readJsonObject で 400、名簿が読めなければ 503。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  // 名簿が読めなければ確認画面も出さない（実名が残った文章を「送っていい」と見せないため）
  let aliases: Awaited<ReturnType<typeof getClientAliases>>;
  try {
    aliases = await getClientAliases(scope);
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
