import { Card } from "@/components/ui/primitives";

/** 下書きの1セクション（明朝の小見出し＋本文）を表示する白カード */
export default function DraftSection({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-4">
      <h3
        className="mb-1.5 text-[13px] font-medium text-[var(--muted)]"
        style={{ fontFamily: "var(--serif)" }}
      >
        {title}
      </h3>
      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{body}</div>
    </Card>
  );
}
