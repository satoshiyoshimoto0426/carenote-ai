import { NextRequest, NextResponse } from "next/server";
import { EVALUATION_CRITERIA } from "@/lib/evaluationCriteria";
import { EvaluationResult } from "@/types/evaluation";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "APIキーが設定されていません。" }, { status: 500 });
  }

  let base64: string;
  try {
    const body = await req.json();
    base64 = body.pdf;
    if (!base64) throw new Error("PDFデータがありません");
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

    if (!resp.ok) {
      const errBody = await resp.text();
      let errMsg = `API Error (${resp.status})`;
      try {
        const errJson = JSON.parse(errBody);
        errMsg = errJson.error?.message || errMsg;
      } catch {}

      if (resp.status === 413 || errMsg.includes("too large")) {
        return NextResponse.json(
          { error: "PDFのサイズが大きすぎます。ページ数の少ないPDFで試してください。" },
          { status: 413 }
        );
      }
      if (resp.status === 529 || resp.status === 503) {
        return NextResponse.json(
          { error: "APIサーバーが混み合っています。少し時間をおいて再試行してください。" },
          { status: 503 }
        );
      }
      if (resp.status === 401) {
        return NextResponse.json(
          { error: "APIキーの認証に失敗しました。" },
          { status: 401 }
        );
      }
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
    if (startIdx === -1 || endIdx === -1) {
      return NextResponse.json(
        { error: "評価結果の解析に失敗しました。再試行してください。" },
        { status: 500 }
      );
    }
    jsonStr = jsonStr.substring(startIdx, endIdx + 1);

    const parsed: EvaluationResult = JSON.parse(jsonStr);
    if (!parsed.categories || parsed.total_score === undefined) {
      return NextResponse.json(
        { error: "評価結果のフォーマットが不正です。再試行してください。" },
        { status: 500 }
      );
    }

    return NextResponse.json(parsed);
  } catch (e: unknown) {
    clearTimeout(timeout);
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json(
        { error: "処理がタイムアウトしました。ページ数の少ないPDFで試すか、少し時間をおいて再試行してください。" },
        { status: 504 }
      );
    }
    const msg = e instanceof Error ? e.message : "不明なエラーが発生しました";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
