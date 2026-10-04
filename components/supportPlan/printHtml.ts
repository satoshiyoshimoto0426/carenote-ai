import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupportPlanAView } from "@/lib/supportPlan/format";
import { SUPPORT_PLAN_PRINT_CSS } from "./printCss";
import SupportPlanDocument from "./SupportPlanDocument";

/**
 * 様式どおりの印刷用ページ（1枚の HTML）を作る。画面の iframe（srcdoc）と試験の両方が使う。
 *
 * なぜこの形か: ページ組み（目次のページ番号・右上の章名・下のページ番号）は Paged.js が行う。
 *   段階1の試験（scripts/supportPlanAGeneration.itest.ts）と同じ版（0.4.3）を CDN から読む。
 * 安全: 画面ではこのページを sandbox="allow-scripts allow-modals" の iframe に入れる（allow-same-origin を付けない）。
 *   外から読む Paged.js が、画面のログイン情報（Clerk のセッション）や親の画面に触れられないようにするため。
 *   そのため親から contentWindow.print() は呼べない ── 親が postMessage("print") を送り、中の小さな受け口が印刷を開く。
 *   本文は React が文字として書き出す（AI の返事に HTML が混ざっても、タグとしては動かない）。
 */
export const PAGEDJS_SRC = "https://cdn.jsdelivr.net/npm/pagedjs@0.4.3/dist/paged.polyfill.min.js";

/**
 * 様式の書体（printCss.ts の font-family の先頭「Noto Sans JP」）を Google Fonts から読む。段階1の試験と同じ指定。
 * なぜ読むか: 読まないと、その端末にある別の書体（Windows なら Yu Gothic）で組まれ、字の幅が変わって
 *   ページの切れ目・枚数が試験で確かめた PDF とずれる。 *
 * data-pagedjs-ignore を付ける（2026-10-03）: 付けないと Paged.js がこの CSS を自分で取りに行き、取れないと
 *   （書体の配信先へ届かない事業所のネットワークなど）ページ組みごと止まり、原案が真っ白になる（同日に再現）。
 *   付けても書体は使われる ── ブラウザがこの CSS を読み、Paged.js は組む前に document.fonts をすべて読み込む（loadFonts）。
 *   届かなければ端末の書体で組まれる（枚数がずれることはあるが、原案は出る）。
 */
export const PRINT_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap";

/**
 * 画面で見るときだけの見た目（印刷では効かない）: Paged.js が組んだページを中央に並べ、1枚ずつ紙に見せる。
 * 画面の iframe は A4 より広いので、無いとページが左に寄って右に白い余白が残る（2026-10-03 録画で確認）。
 * media="screen" の style に分けて置く ── Paged.js は印刷を真似るために、組む CSS の中の @media screen を
 * 捨ててしまう（同日に確認）。media="screen" の style 自体は Paged.js が読まずに残すので、ブラウザがそのまま使う。
 */
export const SCREEN_PREVIEW_CSS = `body { margin: 0; background: #e5e7eb; }
.pagedjs_pages { display: flex; flex-direction: column; align-items: center; padding: 16px 0; }
.pagedjs_page { background: #fff; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18); }`;

/** 親の画面から送る印刷の合図 */
export const PRINT_MESSAGE = "carenote:print";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function buildSupportPlanPrintHtml(view: SupportPlanAView, title: string): string {
  const body = renderToStaticMarkup(createElement(SupportPlanDocument, { view }));
  // 受け口: 親（window.parent）からの合図だけで印刷を開く。ページ組みが終わる前なら、終わってから開く。
  const receiver = `(function(){var done=false,want=false;
window.PagedConfig={auto:true,after:function(){done=true;document.documentElement.dataset.paged="done";if(want){want=false;window.print();}}};
window.addEventListener("message",function(e){if(e.source!==window.parent||e.data!==${JSON.stringify(PRINT_MESSAGE)})return;if(done)window.print();else want=true;});})();`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<link rel="stylesheet" data-pagedjs-ignore href="${PRINT_FONT_HREF}">
<style>${SUPPORT_PLAN_PRINT_CSS}</style>
<style media="screen">${SCREEN_PREVIEW_CSS}</style>
<script>${receiver}</script>
<script src="${PAGEDJS_SRC}"></script>
</head><body>${body}</body></html>`;
}
