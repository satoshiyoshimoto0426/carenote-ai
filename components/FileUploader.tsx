"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { IconArrowRight, IconFileText } from "@/components/ui/icons";
import { btnPrimary } from "@/components/ui/primitives";

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

  const zoneState = dragOver
    ? "border-[var(--green)] bg-[var(--green-soft)]"
    : file
      ? "border-[var(--green-line)] bg-[var(--green-soft)]"
      : "border-[#CFC9BE] bg-white hover:border-[var(--green)]";

  return (
    <div>
      <div className="mb-7 text-center">
        <h2
          className="mb-2 text-xl font-medium text-[var(--ink)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          ケアプラン書類を評価する
        </h2>
        <p className="text-sm text-[var(--muted)]">
          ケアマネが作成した書類一式（PDF）をアップロードしてください
        </p>
        <p className="mt-1 text-xs text-[var(--faint)]">
          推奨：20ページ以下・10MB以下のPDF（最大30MB）
        </p>
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
        className={`mb-5 cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-colors duration-300 ${zoneState}`}
      >
        <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleChange} />
        {file ? (
          <>
            <div className="mb-3 flex justify-center text-[var(--green)]">
              <IconFileText size={34} />
            </div>
            <div className="text-base font-semibold text-[var(--green)]">{file.name}</div>
            <div className="mt-1 text-sm text-[var(--muted)]">
              {fileSizeMB.toFixed(1)} MB — クリックで変更
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 flex justify-center text-[var(--faint)]">
              <IconFileText size={34} />
            </div>
            <div className="text-base font-semibold text-[var(--ink)]">PDFをドラッグ＆ドロップ</div>
            <div className="mt-1 text-sm text-[var(--muted)]">またはクリックしてファイルを選択</div>
          </>
        )}
      </div>

      {file && !loading && (
        <button type="button" onClick={onEvaluate} className={`${btnPrimary} w-full`}>
          AI評価を開始する
          <IconArrowRight size={15} />
        </button>
      )}
    </div>
  );
}
