"use client";

import { EvaluationCategory } from "@/types/evaluation";
import MiniBar from "./MiniBar";

const ICONS = ["📋", "📝", "🔍", "🤝", "📒", "📊", "📤", "🔒"];

interface CategoryCardProps {
  cat: EvaluationCategory;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

export default function CategoryCard({ cat, index, expanded, onToggle }: CategoryCardProps) {
  const pct = (cat.score / cat.max_score) * 100;
  const ringColor = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: `1px solid ${expanded ? ringColor + "66" : "#334155"}`,
        boxShadow: expanded ? `0 0 24px ${ringColor}22` : "none",
      }}
    >
      <div
        onClick={onToggle}
        className="px-5 py-4 cursor-pointer flex items-center gap-4 select-none"
      >
        <span className="text-3xl">{ICONS[index] ?? "📌"}</span>
        <div className="flex-1">
          <div className="text-slate-100 font-bold text-sm mb-1.5">{cat.name}</div>
          <MiniBar score={cat.score} maxScore={cat.max_score} />
        </div>
        <span
          className="text-slate-400 text-xl transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div className="px-5 pb-5 animate-fadeIn">
          <div className="border-t border-slate-700 pt-4">
            {cat.good_points?.length > 0 && (
              <div className="mb-3.5">
                <div className="text-emerald-400 font-bold text-xs mb-2">✓ 良い点</div>
                {cat.good_points.map((p, i) => (
                  <div key={i} className="text-slate-300 text-xs leading-relaxed pl-4 relative mb-1">
                    <span className="absolute left-0 text-emerald-400">・</span>
                    {p}
                  </div>
                ))}
              </div>
            )}

            {cat.issues?.length > 0 && (
              <div className="mb-3.5">
                <div className="text-red-400 font-bold text-xs mb-2">✗ 課題点</div>
                {cat.issues.map((p, i) => (
                  <div key={i} className="text-slate-300 text-xs leading-relaxed pl-4 relative mb-1">
                    <span className="absolute left-0 text-red-400">・</span>
                    {p}
                  </div>
                ))}
              </div>
            )}

            {cat.advice && (
              <div
                className="rounded-xl p-3.5 mt-2"
                style={{ background: "rgba(12,74,110,0.13)", border: "1px solid #0c4a6e" }}
              >
                <div className="text-sky-400 font-bold text-xs mb-1.5">💡 改善アドバイス</div>
                <div className="text-slate-200 text-xs leading-relaxed">{cat.advice}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
