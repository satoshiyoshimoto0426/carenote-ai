import type { SupportLogDraft } from "@/types/supportLog";
import DraftSection from "./DraftSection";

const FIELD_LABELS = [
  ["action", "対応内容"],
  ["background", "背景・理由"],
  ["factsAndStatements", "事実・発言"],
  ["judgement", "アセスメント・判断"],
  ["nextAction", "今後の対応"],
] as const;

/**
 * 支援経過記録（第5表）下書きの表示。使う所: つくる（app/(dashboard)/create/page.tsx）と救済モード（rescue/page.tsx）。
 * A案（R1・2026-09-24）: 日ごとの白いカードをやめ、下に 1px の線を引いた項目にした。種類の札は緑でなく細い線の札
 * （緑は主ボタンと選択中の印だけ）。文字は以前のまま。
 */
export default function SupportLogDraftView({ draft }: { draft: SupportLogDraft }) {
  return (
    <>
      <DraftSection title="利用者名" body={draft.clientName} />

      <div>
        {draft.entries.map((e) => (
          <div key={`${e.date}-${e.action}`} className="draft-item">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="text-sm font-bold text-[var(--ink)]">{e.date}</div>
              <div className="rounded-[4px] border border-[var(--btn-line)] bg-[var(--card)] px-2 py-0.5 text-xs text-[var(--ink-2)]">
                {e.category}
              </div>
            </div>
            <div className="space-y-1.5">
              {FIELD_LABELS.map(([key, label]) => (
                <div key={key} className="text-[13px] leading-[1.8]">
                  <span className="font-bold text-[var(--ink-2)]">【{label}】</span>
                  <span className="whitespace-pre-wrap text-[var(--ink)]">{e[key]}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
