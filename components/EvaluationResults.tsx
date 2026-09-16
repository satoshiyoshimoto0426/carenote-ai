"use client";

import { useState } from "react";
import { exportToExcel } from "@/lib/exportExcel";
import type { EvaluationResult } from "@/types/evaluation";
import CategoryCard from "./CategoryCard";
import ScoreRing from "./ScoreRing";

interface EvaluationResultsProps {
  result: EvaluationResult;
  onReset: () => void;
}

export default function EvaluationResults({ result, onReset }: EvaluationResultsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const judgement =
    result.total_score >= 22 ? "優良" : result.total_score >= 16 ? "改善推奨" : "要改善";
  // 判定の3段階は色で読ませる（緑=優良・琥珀=改善推奨・赤土=要改善）。
  const judgementColor =
    result.total_score >= 22
      ? "var(--green)"
      : result.total_score >= 16
        ? "var(--amber)"
        : "var(--clay)";
  const judgementBg =
    result.total_score >= 22
      ? "var(--green-soft)"
      : result.total_score >= 16
        ? "var(--amber-soft)"
        : "var(--clay-soft)";
  const judgementLine =
    result.total_score >= 22
      ? "var(--green-line)"
      : result.total_score >= 16
        ? "var(--amber-line)"
        : "var(--clay)";

  return (
    <div className="animate-fadeIn">
      {/* Score Header */}
      <div
        className="rounded-[10px] p-7 text-center mb-5"
        style={{
          background: "var(--card)",
          border: "1px solid var(--line)",
          boxShadow: "0 1px 3px rgba(28,27,25,0.06)",
        }}
      >
        <div className="text-[var(--faint)] text-xs font-semibold tracking-[3px] mb-2 uppercase">
          Evaluation Report
        </div>
        <div className="mb-5">
          <span className="code-chip">{result.client_name || "利用者"}様</span>
        </div>
        <div className="flex justify-center mb-4">
          <ScoreRing score={result.total_score} maxScore={27} size={130} />
        </div>
        <div
          className="inline-block px-4 py-1.5 rounded-[8px] text-sm font-bold mb-3"
          style={{
            background: judgementBg,
            color: judgementColor,
            border: `1px solid ${judgementLine}`,
          }}
        >
          {judgement}
        </div>
        {result.evaluator_comment && (
          <p className="text-[var(--muted)] text-sm leading-relaxed mt-3 max-w-md mx-auto">
            {result.evaluator_comment}
          </p>
        )}
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-2.5 mb-5">
        {result.categories?.map((cat, i) => (
          <CategoryCard
            key={cat.id}
            cat={cat}
            index={i}
            expanded={expandedIdx === i}
            onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
          />
        ))}
      </div>

      {/* Priority Improvements */}
      {result.priority_improvements?.length > 0 && (
        <div
          className="rounded-[10px] p-5 mb-5"
          style={{
            background: "var(--clay-soft)",
            border: "1px solid var(--clay)",
          }}
        >
          <div className="text-[var(--clay)] font-bold text-base mb-3.5">🚨 最優先改善事項</div>
          {result.priority_improvements.map((item, i) => (
            <div key={i} className="flex gap-3 items-start mb-2.5">
              <div
                className="tnum flex-shrink-0 w-6 h-6 rounded-[6px] flex items-center justify-center font-bold text-xs text-white"
                style={{ background: "var(--clay)" }}
              >
                {i + 1}
              </div>
              <div className="text-[var(--ink)] text-sm leading-relaxed pt-0.5">{item}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onReset}
          className="flex-1 py-3.5 rounded-[10px] border border-[var(--line)] bg-[var(--card)] text-[var(--muted)] text-sm font-bold cursor-pointer transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        >
          🔄 別の書類を評価
        </button>
        <button
          type="button"
          onClick={() => exportToExcel(result)}
          className="flex-1 py-3.5 rounded-[10px] border-none bg-[var(--green)] text-white text-sm font-bold cursor-pointer transition-colors hover:bg-[var(--green-deep)]"
        >
          📥 Excelでダウンロード
        </button>
      </div>
    </div>
  );
}
