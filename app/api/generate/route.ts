import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { generateCarePlan } from "@/lib/generation/carePlan";
import type { CarePlanInput } from "@/types/carePlan";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // ── 認証チェック ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  // ── 入力の検証 ──
  let input: CarePlanInput;
  try {
    const body = await req.json();
    const assessmentNotes =
      typeof body.assessmentNotes === "string" ? body.assessmentNotes.trim() : "";
    if (!assessmentNotes) {
      return NextResponse.json(
        { error: "アセスメント・面談メモを入力してください。" },
        { status: 400 },
      );
    }
    input = {
      assessmentNotes,
      clientInfo: typeof body.clientInfo === "string" ? body.clientInfo : undefined,
    };
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  // ── 生成 ──
  try {
    const draft = await generateCarePlan(input);
    return NextResponse.json(draft);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[generate] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
