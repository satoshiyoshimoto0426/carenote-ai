import { Card, SectionTitle } from "@/components/ui/primitives";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import DraftSection from "./DraftSection";

/** 第4表（サービス担当者会議の要点）下書きの表示 */
export default function MeetingSummaryDraftView({ draft }: { draft: MeetingSummaryDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />
      <DraftSection
        title="開催日・場所・時間"
        body={`${draft.meetingDate} / ${draft.meetingPlace} / ${draft.meetingTime}`}
      />

      {/* 出席者 */}
      <Card className="p-4">
        <h3
          className="mb-2 text-[13px] font-medium text-[var(--muted)]"
          style={{ fontFamily: "var(--serif)" }}
        >
          会議出席者
        </h3>
        <div className="space-y-1">
          {draft.attendees.map((a) => (
            <div key={`${a.affiliation}-${a.name}`} className="text-sm text-[var(--ink)]">
              {a.affiliation}
              <span className="text-[var(--faint)]">（{a.role}）</span> {a.name}
            </div>
          ))}
        </div>
      </Card>

      {/* 検討項目と内容 */}
      <div>
        <SectionTitle className="mb-2">検討した項目と検討内容</SectionTitle>
        <div className="space-y-3">
          {draft.discussions.map((d, i) => (
            <Card key={d.item} className="p-4">
              <div className="mb-2 text-sm font-medium text-[var(--ink)]">
                {i + 1}. {d.item}
              </div>
              <div className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--ink)]">
                {d.details}
              </div>
            </Card>
          ))}
        </div>
      </div>

      <DraftSection title="結論" body={draft.conclusion} />
      <DraftSection title="残された課題（次回の開催時期）" body={draft.remainingIssues} />
    </>
  );
}
