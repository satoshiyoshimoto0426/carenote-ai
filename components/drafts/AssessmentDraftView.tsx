import { SectionTitle } from "@/components/ui/primitives";
import type { AssessmentDraft } from "@/types/assessment";
import DraftSection from "./DraftSection";

/**
 * アセスメント（課題分析）下書きの表示。使う所: つくる（app/(dashboard)/create/page.tsx）と救済モード（rescue/page.tsx）。
 * A案（R1・2026-09-24）: 項目ごとの白いカードと色つきの角丸の箱をやめ、下に 1px の線を引いた区切りにした。文字は以前のまま。
 */
export default function AssessmentDraftView({ draft }: { draft: AssessmentDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection title="今回のアセスメントの理由" body={draft.assessmentReason} />
      <DraftSection title="主訴・意向" body={draft.mainComplaints} />
      <DraftSection title="これまでの生活と現在の状況（生活歴）" body={draft.lifeHistory} />
      <DraftSection title="現在利用している支援・社会資源" body={draft.currentServices} />
      <DraftSection title="全体像" body={draft.overview} />

      <div className="draft-group">
        <SectionTitle className="mb-1">課題分析14項目（標準項目準拠）の現状と分析</SectionTitle>
        <div>
          {draft.domains.map((d) => (
            <div key={d.domain} className="draft-item">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">{d.domain}</div>
              <div className="space-y-1 text-[13px] leading-[1.8] text-[var(--ink)]">
                <div>
                  <span className="font-bold text-[var(--ink-2)]">現状:</span> {d.currentStatus}
                </div>
                <div>
                  <span className="font-bold text-[var(--ink-2)]">分析:</span> {d.analysis}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {draft.strengths.length > 0 && (
        <section className="draft-section">
          <h3 className="section-label mb-1.5">強み（ストレングス）</h3>
          <div className="space-y-1">
            {draft.strengths.map((s) => (
              <div key={s} className="text-[13px] leading-[1.8] text-[var(--ink)]">
                ・{s}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="draft-section">
        <h3 className="section-label mb-1.5">抽出された生活課題の候補（第2表ニーズの元）</h3>
        <div className="space-y-1.5">
          {draft.identifiedIssues.map((issue, i) => (
            <div key={issue} className="text-[13px] leading-[1.8] text-[var(--ink)]">
              {i + 1}. {issue}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
