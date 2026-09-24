/**
 * 下書きの1つの欄（小見出し＋本文）。つくると救済モードの下書きの表示（components/drafts/*View）が使う。
 *
 * A案（R1・2026-09-24）: 白いカードの箱と明朝の小見出しをやめ、下に 1px の線を引いた区切り（globals.css の
 * .draft-section）と、アートボードの「会議のメモ」と同じ小見出し（.section-label）にした。文字は以前のまま。
 */
export default function DraftSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="draft-section">
      <h3 className="section-label">{title}</h3>
      <div className="mt-1.5 whitespace-pre-wrap text-[14.5px] leading-[1.85] text-[var(--ink)]">
        {body}
      </div>
    </section>
  );
}
