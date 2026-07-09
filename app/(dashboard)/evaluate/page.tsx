"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import EvaluationResults from "@/components/EvaluationResults";
import FileUploader from "@/components/FileUploader";
import LoadingProgress from "@/components/LoadingProgress";
import { IconAlert } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/primitives";
import type { EvaluationResult } from "@/types/evaluation";

const AI_STEPS = [
  { t: 0, v: 40, m: "8カテゴリで評価を開始..." },
  { t: 3000, v: 52, m: "各項目を採点中..." },
  { t: 7000, v: 64, m: "改善アドバイスを生成中..." },
  { t: 13000, v: 74, m: "評価レポートを組み立て中..." },
  { t: 20000, v: 82, m: "もう少しお待ちください..." },
  { t: 30000, v: 88, m: "大きなPDFのため時間がかかっています..." },
  { t: 45000, v: 93, m: "まもなく完了します..." },
];

/** Vercel Blob が使えない環境（ローカル等）ではbase64でフォールバック */
async function uploadPdf(
  file: File,
  onProgress: (p: number, msg: string) => void,
): Promise<{ blobUrl?: string; pdf?: string }> {
  onProgress(5, "PDFをアップロード中...");
  try {
    const blob = await upload(file.name, file, {
      access: "public",
      handleUploadUrl: "/api/blob-upload",
    });
    onProgress(32, "AIが書類を解析中...");
    return { blobUrl: blob.url };
  } catch {
    // BLOB_READ_WRITE_TOKEN 未設定など → base64フォールバック
    onProgress(20, "PDFを読み込んでいます（ローカルモード）...");
    const base64: string = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res((reader.result as string).split(",")[1]);
      reader.onerror = () => rej(new Error("ファイル読み込みエラー"));
      reader.readAsDataURL(file);
    });
    onProgress(32, "AIが書類を解析中...");
    return { pdf: base64 };
  }
}

export default function EvaluatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [fileSizeMB, setFileSizeMB] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMsg, setStatusMsg] = useState("");

  const handleFileSelect = (f: File) => {
    if (f.type !== "application/pdf") {
      setError("PDFファイルのみアップロード可能です");
      return;
    }
    const mb = f.size / 1024 / 1024;
    if (mb > 30) {
      setError(`ファイルが大きすぎます（${mb.toFixed(1)}MB）。30MB以下のPDFをご使用ください。`);
      return;
    }
    setFile(f);
    setFileSizeMB(mb);
    setResult(null);
    setError(null);
  };

  const evaluate = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const aiTimers: ReturnType<typeof setTimeout>[] = [];

    try {
      // ── Step 1: アップロード（Blob優先、フォールバックあり） ──
      const payload = await uploadPdf(file, (p, msg) => {
        setProgress(p);
        setStatusMsg(msg);
      });

      // ── Step 2: AIプログレスアニメーション ──
      AI_STEPS.forEach((s) => {
        aiTimers.push(
          setTimeout(() => {
            setProgress(s.v);
            setStatusMsg(s.m);
          }, s.t),
        );
      });

      // ── Step 3: 評価API呼び出し ──
      const resp = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, fileName: file.name }),
      });

      aiTimers.forEach(clearTimeout);

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);

      setProgress(100);
      setStatusMsg("完了しました");
      setTimeout(() => setResult(data), 500);
    } catch (e: unknown) {
      aiTimers.forEach(clearTimeout);
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        kicker="Evaluate"
        title="ケアプラン評価"
        description="書類一式PDFをアップロードしてAI評価を実行します"
      />

      {!result ? (
        <div className="animate-fadeIn">
          <FileUploader
            file={file}
            fileSizeMB={fileSizeMB}
            loading={loading}
            onFileSelect={handleFileSelect}
            onEvaluate={evaluate}
          />

          {loading && <LoadingProgress progress={progress} statusMsg={statusMsg} />}

          {error && (
            <div className="mt-4 rounded-xl border border-[rgba(192,73,43,0.35)] bg-[rgba(192,73,43,0.05)] p-4">
              <div className="mb-3 flex items-start gap-2 text-sm text-[var(--clay)]">
                <IconAlert size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (file) evaluate();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-[rgba(192,73,43,0.35)] bg-white px-5 py-2 text-sm font-medium text-[var(--clay)] transition-colors hover:bg-[rgba(192,73,43,0.08)]"
              >
                再試行する
              </button>
            </div>
          )}
        </div>
      ) : (
        <EvaluationResults
          result={result}
          onReset={() => {
            setResult(null);
            setFile(null);
            setProgress(0);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
