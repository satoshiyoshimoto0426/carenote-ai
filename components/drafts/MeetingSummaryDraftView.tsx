import { SectionTitle } from "@/components/ui/primitives";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import DraftSection from "./DraftSection";

/**
 * 第4表（サービス担当者会議の要点）下書きの表示。使う所: つくる（app/(dashboard)/create/page.tsx）と救済モード（rescue/page.tsx）。
 * A案（R1・2026-09-24）: 出席者と検討項目の白いカードをやめ、下に 1px の線を引いた区切りにした。文字は以前のまま。
 */
export default function MeetingSummaryDraftView({ draft }: { draft: MeetingSummaryDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection
        title="開催日・場所・時間"
        body={`${draft.meetingDate} / ${draft.meetingPlace} / ${draft.meetingTime}`}
      />

      {/* 出席者 */}
      <section className="draft-section">
        <h3 className="section-label mb-1.5">会議出席者</h3>
        <div className="space-y-1">
          {draft.attendees.map((a) => (
            <div key={`${a.affiliation}-${a.name}`} className="text-[14.5px] text-[var(--ink)]">
              {a.affiliation}
              <span className="text-[var(--muted)]">（{a.role}）</span> {a.name}
            </div>
          ))}
        </div>
      </section>

      {/* 検討項目と内容 */}
      <div className="draft-group">
        <SectionTitle className="mb-1">検討した項目と検討内容</SectionTitle>
        <div>
          {draft.discussions.map((d, i) => (
            <div key={d.item} className="draft-item">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {d.item}
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-[1.8] text-[var(--ink)]">
                {d.details}
              </div>
            </div>
          ))}
        </div>
      </div>

      <DraftSection title="結論" body={draft.conclusion} />
      <DraftSection title="残された課題（次回の開催時期）" body={draft.remainingIssues} />
    </>
  );
}
