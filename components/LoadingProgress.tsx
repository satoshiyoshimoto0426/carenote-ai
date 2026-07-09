"use client";

interface LoadingProgressProps {
  progress: number;
  statusMsg: string;
}

export default function LoadingProgress({ progress, statusMsg }: LoadingProgressProps) {
  return (
    <div className="animate-fadeIn mt-1">
      <div className="mb-3.5 h-2 w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
        <div
          className="h-full rounded-full bg-[var(--green)] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="text-center text-sm text-[var(--muted)]">
        <span className="animate-pulse">{statusMsg}</span>
      </div>
      <div className="mt-2 text-center text-xs text-[var(--faint)]">
        ※ページ数が多いPDFは1〜2分かかることがあります
      </div>
    </div>
  );
}
