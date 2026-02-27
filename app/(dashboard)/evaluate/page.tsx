"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { EvaluationResult } from "@/types/evaluation";
import FileUploader from "@/components/FileUploader";
import LoadingProgress from "@/components/LoadingProgress";
import EvaluationResults from "@/components/EvaluationResults";

// AI評価フェーズのプログレスステップ（Blob upload完了後に開始）
const AI_STEPS = [
  { t: 0,     v: 40, m: "📋 8カテゴリで評価を開始..." },
  { t: 3000,  v: 52, m: "✏️ 各項目を採点中..." },
  { t: 7000,  v: 64, m: "💡 改善アドバイスを生成中..." },
  { t: 13000, v: 74, m: "📊 評価レポートを組み立て中..." },
  { t: 20000, v: 82, m: "⏳ もう少しお待ちください..." },
  { t: 30000, v: 88, m: "⏳ 大きなPDFのため時間がかかっています..." },
  { t: 45000, v: 93, m: "⏳ まもなく完了します..." },
];

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
      // ── Step 1: Vercel Blob に直接アップロード（APIボディ制限を回避）──
      setProgress(5);
      setStatusMsg("📤 PDFをアップロード中...");

      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
      });

      setProgress(32);
      setStatusMsg("🔍 AIが書類を解析中...");

      // ── Step 2: AI評価フェーズのプログレスアニメーション ──
      AI_STEPS.forEach((s) => {
        const t = setTimeout(() => {
          setProgress(s.v);
          setStatusMsg(s.m);
        }, s.t);
        aiTimers.push(t);
      });

      // ── Step 3: 評価API呼び出し（blobUrlのみ送信・軽量） ──
      const resp = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url, fileName: file.name }),
      });

      aiTimers.forEach(clearTimeout);

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);

      setProgress(100);
      setStatusMsg("✨ 完了！");
      setTimeout(() => setResult(data), 500);
    } catch (e: unknown) {
      aiTimers.forEach(clearTimeout);
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-100 mb-1">ケアプラン評価</h1>
        <p className="text-slate-400 text-sm">書類一式PDFをアップロードしてAI評価を実行します</p>
      </div>

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
            <div
              className="rounded-xl p-4 mt-4"
              style={{ background: "rgba(127,29,29,0.2)", border: "1px solid #ef4444" }}
            >
              <div className="text-red-300 text-sm mb-2.5">⚠️ {error}</div>
              <button
                onClick={() => { setError(null); if (file) evaluate(); }}
                className="px-5 py-2 rounded-lg text-red-300 text-sm font-semibold cursor-pointer hover:opacity-80 transition-opacity"
                style={{ border: "1px solid rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.13)" }}
              >
                🔄 再試行する
              </button>
            </div>
          )}
        </div>
      ) : (
        <EvaluationResults
          result={result}
          onReset={() => { setResult(null); setFile(null); setProgress(0); setError(null); }}
        />
      )}
    </div>
  );
}
