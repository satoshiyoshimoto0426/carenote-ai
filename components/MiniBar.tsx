"use client";

interface MiniBarProps {
  score: number;
  maxScore: number;
}

export default function MiniBar({ score, maxScore }: MiniBarProps) {
  const pct = (score / maxScore) * 100;
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex items-center gap-2.5 w-full">
      <div className="flex-1 h-2 rounded bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: color, transition: "width 1s ease" }}
        />
      </div>
      <span className="text-slate-100 font-bold text-sm min-w-[45px] text-right">
        {score}/{maxScore}
      </span>
    </div>
  );
}
