import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { EVALUATION_CRITERIA } from "@/lib/evaluationCriteria";
import { EvaluationResult } from "@/types/evaluation";
import { saveEvaluation } from "@/lib/db";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "APIキーが設定されていません。" }, { status: 500 });
  }

  // ── 認証チェック ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  // ── リクエスト解析（Vercel Blob URL or base64フォールバック） ──
  let base64: string;
  let blobUrl: string | null = null;
  let fileName: string;

  try {
    const body = await req.json();
    fileName = body.fileName || "document.pdf";

    if (body.blobUrl) {
      // ── Vercel Blob 経由（本番） ──
      blobUrl = body.blobUrl as string;
      const blobResp = await fetch(blobUrl);
      if (!blobResp.ok) throw new Error(`Blob fetch failed: ${blobResp.status}`);
      const arrayBuffer = await blobResp.arrayBuffer();
      base64 = Buffer.from(arrayBuffer).toString("base64");
    } else if (body.pdf) {
      // ── base64 直接送信（ローカル開発用フォールバック） ──
      base64 = body.pdf as string;
    } else {
      return NextResponse.json({ error: "PDFデータがありません。" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 115000);

  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: base64 },
                cache_control: { type: "ephemeral" },
              },
              { type: "text", text: EVALUATION_CRITERIA },
            ],
          },
        ],
      }),
    });

    clearTimeout(timeout);

    // ── Blob削除（個人情報保護） ──
    if (blobUrl) del(blobUrl).catch((e) => console.error("[evaluate] blob delete:", e));

    if (!resp.ok) {
      const errBody = await resp.text();
      let errMsg = `API Error (${resp.status})`;
      try { errMsg = JSON.parse(errBody).error?.message || errMsg; } catch {}

      if (resp.status === 413 || errMsg.includes("too large"))
        return NextResponse.json({ error: "PDFのサイズが大きすぎます。ページ数の少ないPDFで試してください。" }, { status: 413 });
      if (resp.status === 529 || resp.status === 503)
        return NextResponse.json({ error: "APIサーバーが混み合っています。少し時間をおいて再試行してください。" }, { status: 503 });
      if (resp.status === 401)
        return NextResponse.json({ error: "APIキーの認証に失敗しました。" }, { status: 401 });
      return NextResponse.json({ error: errMsg }, { status: resp.status });
    }

    const data = await resp.json();
    const text: string = data.content?.map((c: { text?: string }) => c.text || "").join("") || "";

    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    jsonStr = jsonStr.trim();

    const startIdx = jsonStr.indexOf("{");
    const endIdx = jsonStr.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1)
      return NextResponse.json({ error: "評価結果の解析に失敗しました。再試行してください。" }, { status: 500 });

    const parsed: EvaluationResult = JSON.parse(jsonStr.substring(startIdx, endIdx + 1));
    if (!parsed.categories || parsed.total_score === undefined)
      return NextResponse.json({ error: "評価結果のフォーマットが不正です。再試行してください。" }, { status: 500 });

    // ── Supabaseに保存（ノンブロッキング） ──
    saveEvaluation({
      userId,
      clientName: parsed.client_name || "不明",
      fileName,
      totalScore: parsed.total_score,
      result: parsed,
    }).catch((e) => console.error("[evaluate] DB save failed:", e));

    return NextResponse.json(parsed);
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (blobUrl) del(blobUrl).catch(() => {});
    if (e instanceof Error && e.name === "AbortError")
      return NextResponse.json({ error: "処理がタイムアウトしました。ページ数の少ないPDFで試すか、少し時間をおいて再試行してください。" }, { status: 504 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "不明なエラーが発生しました" }, { status: 500 });
  }
}
