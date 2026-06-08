"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";

interface FileUploaderProps {
  file: File | null;
  fileSizeMB: number;
  loading: boolean;
  onFileSelect: (file: File) => void;
  onEvaluate: () => void;
}

export default function FileUploader({
  file,
  fileSizeMB,
  loading,
  onFileSelect,
  onEvaluate,
}: FileUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFileSelect(f);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  };

  const borderColor = dragOver ? "#3b82f6" : file ? "#10b981" : "#475569";
  const bgColor = dragOver
    ? "rgba(59,130,246,0.07)"
    : file
      ? "rgba(16,185,129,0.05)"
      : "rgba(30,41,59,0.27)";

  return (
    <div>
      <div className="text-center mb-7">
        <h2 className="text-2xl font-black mb-2">ケアプラン書類を評価する</h2>
        <p className="text-slate-400 text-sm">
          ケアマネが作成した書類一式（PDF）をアップロードしてください
        </p>
        <p className="text-slate-500 text-xs mt-1">推奨：20ページ以下・10MB以下のPDF（最大30MB）</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileRef.current?.click();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="PDFファイルを選択、またはドラッグ＆ドロップ"
        className="rounded-2xl p-10 text-center cursor-pointer mb-5 transition-all duration-300"
        style={{ border: `2px dashed ${borderColor}`, background: bgColor }}
      >
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleChange} />
        {file ? (
          <>
            <div className="text-5xl mb-3">📄</div>
            <div className="text-emerald-400 font-bold text-base">{file.name}</div>
            <div className="text-slate-400 text-sm mt-1">
              {fileSizeMB.toFixed(1)} MB — クリックで変更
            </div>
          </>
        ) : (
          <>
            <div className="text-5xl mb-3">📁</div>
            <div className="text-slate-100 font-bold text-base">PDFをドラッグ＆ドロップ</div>
            <div className="text-slate-400 text-sm mt-1">またはクリックしてファイルを選択</div>
          </>
        )}
      </div>

      {file && !loading && (
        <button
          type="button"
          onClick={onEvaluate}
          className="w-full py-4 rounded-2xl border-none text-white text-lg font-black cursor-pointer transition-opacity hover:opacity-90"
          style={{
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            boxShadow: "0 4px 24px rgba(59,130,246,0.27)",
          }}
        >
          🔍 AI評価を開始する
        </button>
      )}
    </div>
  );
}
