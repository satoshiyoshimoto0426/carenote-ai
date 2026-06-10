import type { MonitoringDraft } from "@/types/monitoring";
import DraftSection from "./DraftSection";

/** モニタリング記録下書きの表示 */
export default function MonitoringDraftView({ draft }: { draft: MonitoringDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="総合所見" body={draft.overallSummary} />

      <div>
        <div className="text-slate-300 font-bold text-sm mb-2">目標ごとの達成状況</div>
        <div className="space-y-3">
          {draft.goalEvaluations.map((g, i) => (
            <div
              key={g.goal}
              className="rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "1px solid #334155",
              }}
            >
              <div className="text-slate-100 font-bold text-sm mb-2">
                {i + 1}. {g.goal}
              </div>
              <div className="text-slate-300 text-xs leading-relaxed space-y-1">
                <div>
                  <span className="text-amber-300">達成状況:</span> {g.achievement}
                </div>
                <div>
                  <span className="text-sky-400">根拠:</span> {g.evidence}
                </div>
                <div>
                  <span className="text-emerald-300">提案:</span> {g.proposal}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <DraftSection title="プラン全体の判断" body={draft.planRecommendation} />
    </>
  );
}
