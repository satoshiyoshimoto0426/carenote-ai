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
      <div
        className="rounded-xl p-4"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid #334155",
        }}
      >
        <div className="text-slate-400 text-xs font-semibold mb-2">会議出席者</div>
        <div className="space-y-1">
          {draft.attendees.map((a) => (
            <div key={`${a.affiliation}-${a.name}`} className="text-slate-100 text-sm">
              {a.affiliation}
              <span className="text-slate-500">（{a.role}）</span> {a.name}
            </div>
          ))}
        </div>
      </div>

      {/* 検討項目と内容 */}
      <div>
        <div className="text-slate-300 font-bold text-sm mb-2">検討した項目と検討内容</div>
        <div className="space-y-3">
          {draft.discussions.map((d, i) => (
            <div
              key={d.item}
              className="rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                border: "1px solid #334155",
              }}
            >
              <div className="text-slate-100 font-bold text-sm mb-2">
                {i + 1}. {d.item}
              </div>
              <div className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">
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
