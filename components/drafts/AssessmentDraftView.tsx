import { Card, SectionTitle } from "@/components/ui/primitives";
import type { AssessmentDraft } from "@/types/assessment";
import DraftSection from "./DraftSection";

/** アセスメント（課題分析）下書きの表示 */
export default function AssessmentDraftView({ draft }: { draft: AssessmentDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="今回のアセスメントの理由" body={draft.assessmentReason} />
      <DraftSection title="主訴・意向" body={draft.mainComplaints} />
      <DraftSection title="これまでの生活と現在の状況（生活歴）" body={draft.lifeHistory} />
      <DraftSection title="現在利用している支援・社会資源" body={draft.currentServices} />
      <DraftSection title="全体像" body={draft.overview} />

      <div>
        <SectionTitle className="mb-2">課題分析14項目（標準項目準拠）の現状と分析</SectionTitle>
        <div className="space-y-3">
          {draft.domains.map((d) => (
            <Card key={d.domain} className="p-4">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">{d.domain}</div>
              <div className="space-y-1 text-xs leading-relaxed text-[var(--ink)]">
                <div>
                  <span className="font-medium text-[var(--green)]">現状:</span> {d.currentStatus}
                </div>
                <div>
                  <span className="font-medium text-[var(--green)]">分析:</span> {d.analysis}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {draft.strengths.length > 0 && (
        <div className="rounded-2xl border border-[var(--green-line)] bg-[var(--green-soft)] p-4">
          <h3
            className="mb-2 text-sm font-semibold text-[var(--green)]"
            style={{ fontFamily: "var(--serif)" }}
          >
            強み（ストレングス）
          </h3>
          <div className="space-y-1">
            {draft.strengths.map((s) => (
              <div key={s} className="text-xs leading-relaxed text-[var(--ink)]">
                ・{s}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-[var(--green-line)] bg-white p-4">
        <h3
          className="mb-2 text-sm font-semibold text-[var(--green)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          抽出された生活課題の候補（第2表ニーズの元）
        </h3>
        <div className="space-y-1.5">
          {draft.identifiedIssues.map((issue, i) => (
            <div key={issue} className="text-xs leading-relaxed text-[var(--ink)]">
              {i + 1}. {issue}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
