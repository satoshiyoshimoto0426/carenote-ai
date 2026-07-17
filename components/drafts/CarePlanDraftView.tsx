import { Card, SectionTitle } from "@/components/ui/primitives";
import type { CarePlanDraft } from "@/types/carePlan";
import DraftSection from "./DraftSection";

/** ケアプラン（第1・2表）下書きの表示 */
export default function CarePlanDraftView({ draft }: { draft: CarePlanDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="利用者及び家族の意向（第1表）" body={draft.intentions} />
      <DraftSection title="意向を踏まえた課題分析の結果（第1表）" body={draft.assessmentSummary} />
      <DraftSection title="総合的な援助の方針（第1表）" body={draft.comprehensivePolicy} />

      <div>
        <SectionTitle className="mb-2">
          生活全般の解決すべき課題と目標・サービス（第2表）
        </SectionTitle>
        <div className="space-y-3">
          {draft.needs.map((n, i) => (
            <Card key={n.need} className="p-4">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {n.need}
              </div>
              <div className="space-y-1 text-xs leading-relaxed text-[var(--ink)]">
                <div>
                  <span className="font-medium text-[var(--green)]">長期目標:</span>{" "}
                  {n.longTermGoal}（{n.longTermPeriod}）
                </div>
                <div>
                  <span className="font-medium text-[var(--green)]">短期目標:</span>{" "}
                  {n.shortTermGoal}（{n.shortTermPeriod}）
                </div>
              </div>
              {n.services.length > 0 && (
                <div className="mt-2.5 space-y-1 border-t border-[var(--line-soft)] pt-2.5">
                  {n.services.map((s) => (
                    <div key={s.content} className="text-xs text-[var(--ink)]">
                      ・{s.content}
                      <span className="text-[var(--faint)]">
                        （{s.serviceType} / {s.frequency} / {s.period} / 担当: {s.provider}）
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
