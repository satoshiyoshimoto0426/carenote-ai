import { SectionTitle } from "@/components/ui/primitives";
import type { CarePlanDraft } from "@/types/carePlan";
import DraftSection from "./DraftSection";

/**
 * ケアプラン（第1・2表）下書きの表示。使う所: つくる（app/(dashboard)/create/page.tsx）と救済モード（rescue/page.tsx）。
 * A案（R1・2026-09-24）: 課題ごとの白いカードをやめ、下に 1px の線を引いた項目（globals.css の .draft-item）にした。文字は以前のまま。
 */
export default function CarePlanDraftView({ draft }: { draft: CarePlanDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="利用者及び家族の意向（第1表）" body={draft.intentions} />
      <DraftSection title="意向を踏まえた課題分析の結果（第1表）" body={draft.assessmentSummary} />
      <DraftSection title="総合的な援助の方針（第1表）" body={draft.comprehensivePolicy} />

      <div className="draft-group">
        <SectionTitle className="mb-1">
          生活全般の解決すべき課題と目標・サービス（第2表）
        </SectionTitle>
        <div>
          {draft.needs.map((n, i) => (
            <div key={n.need} className="draft-item">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {n.need}
              </div>
              <div className="space-y-1 text-[13px] leading-[1.8] text-[var(--ink)]">
                <div>
                  <span className="font-bold text-[var(--ink-2)]">長期目標:</span> {n.longTermGoal}
                  （{n.longTermPeriod}）
                </div>
                <div>
                  <span className="font-bold text-[var(--ink-2)]">短期目標:</span> {n.shortTermGoal}
                  （{n.shortTermPeriod}）
                </div>
              </div>
              {n.services.length > 0 && (
                <div className="mt-2.5 space-y-1 border-t border-[var(--line-faint)] pt-2.5">
                  {n.services.map((s) => (
                    <div key={s.content} className="text-[13px] leading-[1.8] text-[var(--ink)]">
                      ・{s.content}
                      <span className="text-[var(--muted)]">
                        （{s.serviceType} / {s.frequency} / {s.period} / 担当: {s.provider}）
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
