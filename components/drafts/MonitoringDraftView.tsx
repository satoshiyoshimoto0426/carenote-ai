import { Card, SectionTitle } from "@/components/ui/primitives";
import type { MonitoringDraft } from "@/types/monitoring";
import DraftSection from "./DraftSection";

/** モニタリング記録下書きの表示 */
export default function MonitoringDraftView({ draft }: { draft: MonitoringDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="総合所見" body={draft.overallSummary} />

      <div>
        <SectionTitle className="mb-2">目標ごとの達成状況</SectionTitle>
        <div className="space-y-3">
          {draft.goalEvaluations.map((g, i) => (
            <Card key={g.goal} className="p-4">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {g.goal}
              </div>
              <div className="space-y-1 text-xs leading-relaxed text-[var(--ink)]">
                <div>
                  <span className="font-medium text-[#7A5B1E]">達成状況:</span> {g.achievement}
                </div>
                <div>
                  <span className="font-medium text-[var(--green)]">根拠:</span> {g.evidence}
                </div>
                <div>
                  <span className="font-medium text-[var(--green)]">提案:</span> {g.proposal}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <DraftSection title="プラン全体の判断" body={draft.planRecommendation} />
    </>
  );
}
