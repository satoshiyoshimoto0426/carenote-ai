"use client";

import type { EvaluationCategory } from "@/types/evaluation";
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
  // 良い/普通/悪い の3段階（ScoreRing と同じ割り当て）。開いた時だけ枠線に出す。
  const ringColor = pct >= 80 ? "var(--green)" : pct >= 60 ? "var(--amber)" : "var(--clay)";

  return (
    <div
      className="rounded-[10px] overflow-hidden transition-all duration-300"
      style={{
        background: "var(--card)",
        border: `1px solid ${expanded ? ringColor : "var(--line)"}`,
        boxShadow: "0 1px 3px rgba(28,27,25,0.06)",
      }}
    >
      <div
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="px-5 py-4 cursor-pointer flex items-center gap-4 select-none"
      >
        <span className="text-2xl">{ICONS[index] ?? "📌"}</span>
        <div className="flex-1">
          <div className="text-[var(--ink)] font-bold text-sm mb-1.5">{cat.name}</div>
          <MiniBar score={cat.score} maxScore={cat.max_score} />
        </div>
        <span
          className="text-[var(--faint)] text-base transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div className="px-5 pb-5 animate-fadeIn">
          <div className="border-t border-[var(--line-soft)] pt-4">
            {cat.good_points?.length > 0 && (
              <div className="mb-3.5">
                <div className="text-[var(--green)] font-bold text-xs mb-2">✓ 良い点</div>
                {cat.good_points.map((p, i) => (
                  <div
                    key={i}
                    className="text-[var(--muted)] text-xs leading-relaxed pl-4 relative mb-1"
                  >
                    <span className="absolute left-0 text-[var(--green)]">・</span>
                    {p}
                  </div>
                ))}
              </div>
            )}

            {cat.issues?.length > 0 && (
              <div className="mb-3.5">
                <div className="text-[var(--clay)] font-bold text-xs mb-2">✗ 課題点</div>
                {cat.issues.map((p, i) => (
                  <div
                    key={i}
                    className="text-[var(--muted)] text-xs leading-relaxed pl-4 relative mb-1"
                  >
                    <span className="absolute left-0 text-[var(--clay)]">・</span>
                    {p}
                  </div>
                ))}
              </div>
            )}

            {cat.advice && (
              <div
                className="rounded-[8px] p-3.5 mt-2"
                style={{
                  background: "var(--amber-soft)",
                  border: "1px solid var(--amber-line)",
                }}
              >
                <div className="text-[var(--amber)] font-bold text-xs mb-1.5">
                  💡 改善アドバイス
                </div>
                <div className="text-[var(--ink)] text-xs leading-relaxed">{cat.advice}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
