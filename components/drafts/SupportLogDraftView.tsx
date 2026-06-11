import type { SupportLogDraft } from "@/types/supportLog";
import DraftSection from "./DraftSection";

const FIELD_LABELS = [
  ["action", "対応内容"],
  ["background", "背景・理由"],
  ["factsAndStatements", "事実・発言"],
  ["judgement", "アセスメント・判断"],
  ["nextAction", "今後の対応"],
] as const;

/** 支援経過記録（第5表）下書きの表示 */
export default function SupportLogDraftView({ draft }: { draft: SupportLogDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />

      <div className="space-y-3">
        {draft.entries.map((e) => (
          <div
            key={`${e.date}-${e.action}`}
            className="rounded-xl p-4"
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid #334155",
            }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <div className="text-slate-100 font-bold text-sm">{e.date}</div>
              <div
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(59,130,246,0.15)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59,130,246,0.3)",
                }}
              >
                {e.category}
              </div>
            </div>
            <div className="space-y-1.5">
              {FIELD_LABELS.map(([key, label]) => (
                <div key={key} className="text-xs leading-relaxed">
                  <span className="text-sky-400 font-semibold">【{label}】</span>
                  <span className="text-slate-200 whitespace-pre-wrap">{e[key]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
