"use client";

import { useState } from "react";
import { EvaluationResult } from "@/types/evaluation";
import ScoreRing from "./ScoreRing";
import CategoryCard from "./CategoryCard";
import { exportToExcel } from "@/lib/exportExcel";

interface EvaluationResultsProps {
  result: EvaluationResult;
  onReset: () => void;
}

export default function EvaluationResults({ result, onReset }: EvaluationResultsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const judgement =
    result.total_score >= 22 ? "優良" : result.total_score >= 16 ? "改善推奨" : "要改善";
  const judgementColor =
    result.total_score >= 22 ? "#10b981" : result.total_score >= 16 ? "#f59e0b" : "#ef4444";
  const judgementBg =
    result.total_score >= 22
      ? "rgba(16,185,129,0.13)"
      : result.total_score >= 16
      ? "rgba(245,158,11,0.13)"
      : "rgba(239,68,68,0.13)";

  return (
    <div className="animate-fadeIn">
      {/* Score Header */}
      <div
        className="rounded-3xl p-7 text-center mb-5"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid #334155",
          boxShadow: "0 8px 48px rgba(0,0,0,0.4)",
        }}
      >
        <div className="text-slate-400 text-xs font-semibold tracking-[3px] mb-1 uppercase">
          Evaluation Report
        </div>
        <div className="text-xl font-black mb-5">
          {result.client_name || "利用者"}様
        </div>
        <div className="flex justify-center mb-4">
          <ScoreRing score={result.total_score} maxScore={27} size={130} />
        </div>
        <div
          className="inline-block px-5 py-1.5 rounded-full text-sm font-bold mb-3"
          style={{ background: judgementBg, color: judgementColor, border: `1px solid ${judgementColor}44` }}
        >
          {judgement}
        </div>
        {result.evaluator_comment && (
          <p className="text-slate-300 text-sm leading-relaxed mt-3 max-w-md mx-auto">
            {result.evaluator_comment}
          </p>
        )}
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-2.5 mb-5">
        {result.categories?.map((cat, i) => (
          <CategoryCard
            key={i}
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
          className="rounded-2xl p-5 mb-5"
          style={{
            background: "linear-gradient(135deg, rgba(127,29,29,0.13), #1e293b)",
            border: "1px solid rgba(239,68,68,0.27)",
          }}
        >
          <div className="text-red-300 font-black text-base mb-3.5">🚨 最優先改善事項</div>
          {result.priority_improvements.map((item, i) => (
            <div key={i} className="flex gap-3 items-start mb-2.5">
              <div
                className="flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs text-red-300"
                style={{ background: "rgba(239,68,68,0.2)" }}
              >
                {i + 1}
              </div>
              <div className="text-slate-200 text-sm leading-relaxed pt-0.5">{item}</div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2.5">
        <button
          onClick={onReset}
          className="flex-1 py-3.5 rounded-2xl border border-slate-600 bg-transparent text-slate-100 text-sm font-bold cursor-pointer hover:bg-slate-800 transition-colors"
        >
          🔄 別の書類を評価
        </button>
        <button
          onClick={() => exportToExcel(result)}
          className="flex-1 py-3.5 rounded-2xl border-none text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity"
          style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
        >
          📥 Excelでダウンロード
        </button>
      </div>
    </div>
  );
}
