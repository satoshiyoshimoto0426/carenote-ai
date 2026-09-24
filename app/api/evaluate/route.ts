import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { readPrivateBlob } from "@/lib/blob/readPrivate";
import { saveEvaluation } from "@/lib/db";
import { EVALUATE_MODEL } from "@/lib/evaluate/model";
import { EVALUATION_CRITERIA } from "@/lib/evaluationCriteria";
import { parseEvaluationJson } from "@/lib/parseEvaluationJson";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";
import { isBlobUrl } from "@/lib/rescue/sourceDocs";

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

  // 本文は lib/requestBody.ts の readJsonObject で読む（オブジェクトでなければ 400。2026-09-24 検収の指摘で他の入口と揃えた）
  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  try {
    fileName =
      typeof body.fileName === "string" && body.fileName !== "" ? body.fileName : "document.pdf";

    if (body.blobUrl) {
      // ── Vercel Blob 経由（本番） ──
      // 文字列でなければ空にして、下の許可リストで止める（読みに行かない）
      blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
      // 自前の非公開ストア以外は読みに行かない（SSRF 対策）。非公開なので認証つき get() で読む
      if (!isBlobUrl(blobUrl)) throw new Error("Blob URL not allowed");
      const arrayBuffer = await readPrivateBlob(blobUrl);
      if (!arrayBuffer) throw new Error("Blob not found");
      base64 = Buffer.from(arrayBuffer).toString("base64");
    } else if (typeof body.pdf === "string" && body.pdf !== "") {
      // ── base64 直接送信（ローカル開発用フォールバック） ──
      base64 = body.pdf;
    } else {
      return NextResponse.json({ error: "PDFデータがありません。" }, { status: 400 });
    }
  } catch {
    // 読み取れなかった時も一時保管を残さない（許可したホストの URL のみ削除を試みる）
    if (blobUrl && isBlobUrl(blobUrl)) del(blobUrl).catch(() => {});
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
        model: EVALUATE_MODEL,
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
      try {
        errMsg = JSON.parse(errBody).error?.message || errMsg;
      } catch {}

      if (resp.status === 413 || errMsg.includes("too large"))
        return NextResponse.json(
          { error: "PDFのサイズが大きすぎます。ページ数の少ないPDFで試してください。" },
          { status: 413 },
        );
      if (resp.status === 529 || resp.status === 503)
        return NextResponse.json(
          { error: "APIサーバーが混み合っています。少し時間をおいて再試行してください。" },
          { status: 503 },
        );
      if (resp.status === 401)
        return NextResponse.json({ error: "APIキーの認証に失敗しました。" }, { status: 401 });
      return NextResponse.json({ error: errMsg }, { status: resp.status });
    }

    const data = await resp.json();
    const text: string = data.content?.map((c: { text?: string }) => c.text || "").join("") || "";

    const parseResult = parseEvaluationJson(text);
    if (!parseResult.ok) {
      const error =
        parseResult.reason === "invalid_shape"
          ? "評価結果のフォーマットが不正です。再試行してください。"
          : "評価結果の解析に失敗しました。再試行してください。";
      return NextResponse.json({ error }, { status: 500 });
    }
    const parsed = parseResult.data;

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
      return NextResponse.json(
        {
          error:
            "処理がタイムアウトしました。ページ数の少ないPDFで試すか、少し時間をおいて再試行してください。",
        },
        { status: 504 },
      );
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "不明なエラーが発生しました" },
      { status: 500 },
    );
  }
}
