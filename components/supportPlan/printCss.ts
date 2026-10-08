/**
 * 就労A型の個別支援計画書の印刷用の見た目（事業所の様式に忠実に合わせる）。
 *
 * なぜ文字列で持つか: 印刷画面は Tailwind の層の外で、様式の見た目だけを当てる必要がある（アプリの全体の見た目と混ぜない）。
 *   描画の部品 components/supportPlan/SupportPlanDocument.tsx と、試験で PDF を作る道具の両方が同じ文字列を使う。
 * ページ組み: Paged.js（目次のページ番号 target-counter・右上の章名 string-set・下のページ番号）。
 * 色は様式の PDF から読んだ値: 紺 #1a3a5c・見出し列の地 #e7ecf1・罫線 #cfcfcf・注記の地 #f0f0f0・本文 #1a1a1a。
 */
export const SUPPORT_PLAN_PRINT_CSS = `:root {
  --navy: #1a3a5c;
  --label: #e7ecf1;
  --rule: #cfcfcf;
  --note: #f0f0f0;
  --ink: #1a1a1a;
  --sub: #5f6b78;
  --toc-num: #6b85a3;
}
@page {
  size: A4;
  margin: 20mm 17mm 18mm 17mm;
  @top-right { content: string(section); font-family: "Noto Sans JP", sans-serif; font-size: 7.5pt; color: var(--sub); padding-top: 6mm; }
  @bottom-center { content: counter(page); font-family: "Noto Sans JP", sans-serif; font-size: 8pt; color: #8a929b; }
}
@page cover {
  margin: 0;
  @top-right { content: none; }
  @bottom-center { content: none; }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: "Noto Sans JP", "Hiragino Sans", "Yu Gothic", sans-serif;
  color: var(--ink);
  font-size: 10pt;
  line-height: 1.65;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── 表紙 ── */
.cover {
  page: cover;
  width: 210mm;
  height: 297mm;
  background: var(--navy);
  color: #fff;
  position: relative;
  text-align: center;
  break-after: page;
}
.cover .kind { padding-top: 38mm; font-size: 11pt; letter-spacing: 0.08em; opacity: 0.92; }
.cover h1 { margin: 9mm 0 0; font-size: 29pt; font-weight: 700; letter-spacing: 0.06em; }
.cover .who { margin-top: 7mm; font-size: 10.5pt; opacity: 0.9; }
.cover .box {
  position: absolute; left: 38mm; right: 38mm; top: 120mm;
  border: 1px solid rgba(255,255,255,0.75); border-radius: 3px;
  padding: 10mm 12mm 8mm; text-align: left;
}
.cover .row { display: grid; grid-template-columns: 30mm 1fr; align-items: end; margin-bottom: 5.5mm; font-size: 9.5pt; }
.cover .row .v { border-bottom: 1px solid rgba(255,255,255,0.6); padding-bottom: 1.2mm; }
.cover .foot { position: absolute; left: 0; right: 0; bottom: 30mm; font-size: 7.5pt; line-height: 1.9; opacity: 0.7; }

/* ── 見出し ── */
h2.toc-title, h2.sec {
  color: var(--navy);
  font-size: 14pt;
  font-weight: 700;
  margin: 7mm 0 3.5mm;
  padding-bottom: 2mm;
  border-bottom: 2px solid var(--navy);
  break-after: avoid;
}
h2.toc-title { margin-top: 4mm; }
h2.sec { string-set: section content(text); }
h3 { font-size: 10pt; font-weight: 700; margin: 5mm 0 2mm; break-after: avoid; }

/* ── 目次 ── */
.toc { list-style: none; margin: 0 0 4mm; padding: 0; }
.toc li { border-bottom: 1px solid #e3e6ea; padding: 2.6mm 0; }
.toc a { color: var(--ink); text-decoration: none; display: flex; justify-content: space-between; font-size: 10pt; }
.toc a::after { content: target-counter(attr(href), page); color: var(--toc-num); }

/* ── 注記の帯 ── */
.intro { background: var(--note); color: #4a525b; font-size: 7.8pt; padding: 3mm 4mm; margin: 0 0 4mm; }
.note { background: var(--note); color: #4a525b; font-size: 7.8pt; padding: 3mm 4mm; margin: 3mm 0 2mm; }

/* ── 表 ── */
table { width: 100%; border-collapse: collapse; margin: 0 0 3mm; font-size: 9.6pt; }
th, td { border: 1px solid var(--rule); padding: 2.1mm 3mm; vertical-align: top; text-align: left; }
th { background: var(--label); font-weight: 700; color: #26303a; }
tr { break-inside: avoid; }
table.kv4 th { width: 14%; }
table.kv4 td { width: 36%; }
table.kv2 th { width: 26%; }
table.kv2.wide th { width: 27%; }
table.needs thead th { text-align: center; }
table.needs td:first-child { width: 33%; }
.blank { color: #444; }
.chk { white-space: nowrap; }
ul.dots { margin: 0; padding-left: 4.5mm; }
ul.dots li { margin: 0.6mm 0; }

/* ── 短期目標の枠 ── */
.goal {
  border: 1px solid var(--rule);
  border-radius: 5px;
  padding: 4mm 4mm 1mm;
  margin: 0 0 5mm;
  break-inside: avoid;
}
.goal h4 { margin: 0 0 3mm; font-size: 10.5pt; font-weight: 700; }
.goal table { margin-bottom: 3mm; }

.source { border-top: 1px solid var(--rule); margin-top: 6mm; padding-top: 3mm; font-size: 7.5pt; color: #5c646d; line-height: 1.8; }
.lines { white-space: pre-line; }
/* 見出しと続く表・最初の枠をページの境目で分けない（見出しだけがページの下に残らないように） */
.keep { break-inside: avoid; }
table.needs { break-inside: avoid; }
`;
