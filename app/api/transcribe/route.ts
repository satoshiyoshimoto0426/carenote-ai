import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { createOpenAiTranscriber, TranscribeError } from "@/lib/transcribe/provider";
import { validateAudio } from "@/lib/transcribe/validate";

// 長い通話の文字起こしは時間がかかる
export const maxDuration = 300;

/**
 * 電話の録音ファイルを文字にして返す（第3段・docs/specs/call-pipeline.md）。
 * 音声は保存しない（受け取って外部サービスへ渡し、返事の文字だけ返す）。
 * 返した文字はそのあと /create の「送る前に見る」→ 黒塗り → AI要約の流れに乗る。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  const transcriber = createOpenAiTranscriber();
  if (!transcriber) {
    return NextResponse.json(
      {
        error:
          "文字起こしサービスが設定されていません（管理者が OPENAI_API_KEY を設定してください）。",
      },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "音声ファイルを受け取れませんでした。" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "音声ファイルを選んでください。" }, { status: 400 });

  const check = validateAudio(file.name, file.size);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  try {
    const { text } = await transcriber.transcribe(file, `audio.${check.ext}`);
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof TranscribeError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 500 ? 502 : e.status });
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[transcribe] error:", detail);
    return NextResponse.json({ error: "文字起こしに失敗しました。" }, { status: 500 });
  }
}
