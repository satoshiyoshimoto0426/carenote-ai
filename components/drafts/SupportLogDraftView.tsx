import { Card } from "@/components/ui/primitives";
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
          <Card key={`${e.date}-${e.action}`} className="p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-sm font-medium text-[var(--ink)]">{e.date}</div>
              <div className="rounded-full border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs font-medium text-[var(--green)]">
                {e.category}
              </div>
            </div>
            <div className="space-y-1.5">
              {FIELD_LABELS.map(([key, label]) => (
                <div key={key} className="text-xs leading-relaxed">
                  <span className="font-medium text-[var(--green)]">【{label}】</span>
                  <span className="whitespace-pre-wrap text-[var(--ink)]">{e[key]}</span>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
