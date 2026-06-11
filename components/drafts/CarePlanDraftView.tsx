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
        <div className="text-slate-300 font-bold text-sm mb-2">
          生活全般の解決すべき課題と目標・サービス（第2表）
        </div>
        <div className="space-y-3">
          {draft.needs.map((n, i) => (
            <div
              key={n.need}
              className="rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "1px solid #334155",
              }}
            >
              <div className="text-slate-100 font-bold text-sm mb-2">
                {i + 1}. {n.need}
              </div>
              <div className="text-slate-300 text-xs leading-relaxed space-y-1">
                <div>
                  <span className="text-sky-400">長期目標:</span> {n.longTermGoal}（
                  {n.longTermPeriod}）
                </div>
                <div>
                  <span className="text-sky-400">短期目標:</span> {n.shortTermGoal}（
                  {n.shortTermPeriod}）
                </div>
              </div>
              {n.services.length > 0 && (
                <div className="mt-2.5 border-t border-slate-700 pt-2.5 space-y-1">
                  {n.services.map((s) => (
                    <div key={s.content} className="text-slate-300 text-xs">
                      ・{s.content}
                      <span className="text-slate-500">
                        （{s.serviceType} / {s.frequency} / {s.period}）
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
