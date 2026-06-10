import type { AssessmentDraft } from "@/types/assessment";
import DraftSection from "./DraftSection";

/** アセスメント（課題分析）下書きの表示 */
export default function AssessmentDraftView({ draft }: { draft: AssessmentDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="全体像" body={draft.overview} />

      <div>
        <div className="text-slate-300 font-bold text-sm mb-2">領域ごとの現状と分析</div>
        <div className="space-y-3">
          {draft.domains.map((d) => (
            <div
              key={d.domain}
              className="rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "1px solid #334155",
              }}
            >
              <div className="text-slate-100 font-bold text-sm mb-2">{d.domain}</div>
              <div className="text-slate-300 text-xs leading-relaxed space-y-1">
                <div>
                  <span className="text-sky-400">現状:</span> {d.currentStatus}
                </div>
                <div>
                  <span className="text-sky-400">分析:</span> {d.analysis}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {draft.strengths.length > 0 && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "linear-gradient(135deg, rgba(6,78,59,0.18), #1e293b)",
            border: "1px solid rgba(16,185,129,0.27)",
          }}
        >
          <div className="text-emerald-300 font-bold text-sm mb-2">💪 強み（ストレングス）</div>
          <div className="space-y-1">
            {draft.strengths.map((s) => (
              <div key={s} className="text-slate-200 text-xs leading-relaxed">
                ・{s}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        className="rounded-xl p-4"
        style={{
          background: "linear-gradient(135deg, rgba(30,58,138,0.18), #1e293b)",
          border: "1px solid rgba(59,130,246,0.27)",
        }}
      >
        <div className="text-sky-300 font-bold text-sm mb-2">
          📌 抽出された生活課題の候補（第2表ニーズの元）
        </div>
        <div className="space-y-1.5">
          {draft.identifiedIssues.map((issue, i) => (
            <div key={issue} className="text-slate-200 text-xs leading-relaxed">
              {i + 1}. {issue}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
