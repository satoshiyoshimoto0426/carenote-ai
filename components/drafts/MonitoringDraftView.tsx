import { SectionTitle } from "@/components/ui/primitives";
import type { MonitoringDraft } from "@/types/monitoring";
import DraftSection from "./DraftSection";

/**
 * モニタリング記録下書きの表示。使う所: つくる（app/(dashboard)/create/page.tsx）と救済モード（rescue/page.tsx）。
 * A案（R1・2026-09-24）: 目標ごとの白いカードをやめ、下に 1px の線を引いた項目にした。項目の名前は緑・黄色でなく
 * 本文の補助の色（緑は主ボタンと選択中の印、黄色は注意だけに使う決まり）。文字は以前のまま。
 */
export default function MonitoringDraftView({ draft }: { draft: MonitoringDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="総合所見" body={draft.overallSummary} />

      <div className="draft-group">
        <SectionTitle className="mb-1">目標ごとの達成状況</SectionTitle>
        <div>
          {draft.goalEvaluations.map((g, i) => (
            <div key={g.goal} className="draft-item">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {g.goal}
              </div>
              <div className="space-y-1 text-[13px] leading-[1.8] text-[var(--ink)]">
                <div>
                  <span className="font-bold text-[var(--ink-2)]">達成状況:</span> {g.achievement}
                </div>
                <div>
                  <span className="font-bold text-[var(--ink-2)]">根拠:</span> {g.evidence}
                </div>
                <div>
                  <span className="font-bold text-[var(--ink-2)]">提案:</span> {g.proposal}
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
