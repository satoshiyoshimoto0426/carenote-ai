import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { AliasLoadError, getClientAliases } from "@/lib/db/clients";
import { generateKaipokeAssessmentSheet } from "@/lib/generation/kaipokeAssessment";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskPii } from "@/lib/privacy/maskPii";
import { createPiiVault, restoreDeep } from "@/lib/privacy/vault";
import type { AssessmentDraft } from "@/types/assessment";

export const maxDuration = 300;

/**
 * アセスメント下書き → カイポケ10ページの欄に合わせた転記用シート（docs/KAIPOKE-TRANSCRIPTION-SPEC.md §6）。
 * 下書きは /api/generate を通っているので記号化済だが、補足メモは黒塗りを通す。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let body: { draft?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }
  const draft = body.draft as AssessmentDraft | undefined;
  if (!draft || typeof draft !== "object" || !Array.isArray(draft.domains)) {
    return NextResponse.json({ error: "アセスメントの下書きが必要です。" }, { status: 400 });
  }

  let aliases: Awaited<ReturnType<typeof getClientAliases>>;
  try {
    aliases = await getClientAliases(userId);
  } catch (e) {
    if (e instanceof AliasLoadError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const vault = createPiiVault();
  try {
    const notes =
      typeof body.notes === "string" ? maskPii(body.notes, aliases, vault).text : undefined;
    const sheet = await generateKaipokeAssessmentSheet(draft, notes);
    return NextResponse.json(restoreDeep(sheet, vault));
  } catch (e: unknown) {
    if (e instanceof PiiLeakError) return NextResponse.json({ error: e.message }, { status: 422 });
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[kaipoke/assessment] error:", detail);
    return NextResponse.json({ error: "カイポケ用の整形に失敗しました。" }, { status: 500 });
  }
}
