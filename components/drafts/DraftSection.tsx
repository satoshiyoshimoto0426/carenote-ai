/** 下書きの1セクション（見出し＋本文）を表示する共通カード */
export default function DraftSection({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: "1px solid #334155",
      }}
    >
      <div className="text-slate-400 text-xs font-semibold mb-1.5">{title}</div>
      <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">{body}</div>
    </div>
  );
}
