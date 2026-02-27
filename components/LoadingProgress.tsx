"use client";

interface LoadingProgressProps {
  progress: number;
  statusMsg: string;
}

export default function LoadingProgress({ progress, statusMsg }: LoadingProgressProps) {
  return (
    <div className="animate-fadeIn mt-1">
      <div className="w-full h-2 rounded bg-slate-800 overflow-hidden mb-3.5">
        <div
          className="h-full rounded transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, #3b82f6, #8b5cf6)",
          }}
        />
      </div>
      <div className="text-center text-slate-400 text-sm">
        <span className="animate-pulse">{statusMsg}</span>
      </div>
      <div className="text-center text-slate-500 text-xs mt-2">
        ※ページ数が多いPDFは1〜2分かかることがあります
      </div>
    </div>
  );
}
