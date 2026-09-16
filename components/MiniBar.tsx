"use client";

interface MiniBarProps {
  score: number;
  maxScore: number;
}

export default function MiniBar({ score, maxScore }: MiniBarProps) {
  const pct = (score / maxScore) * 100;
  // 良い / 注意 / 要改善 の3系統。色はトークンに合わせる（意味の色分けは維持）
  const color = pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--clay)";

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--line-soft)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: "width 1s ease" }}
        />
      </div>
      <span className="tnum min-w-[45px] text-right text-sm font-bold text-[var(--ink)]">
        {score}/{maxScore}
      </span>
    </div>
  );
}
