import { describe, expect, it } from "vitest";
import { buildSupportPlanAView, SUPPORT_PLAN_A_CHAPTERS } from "@/lib/supportPlan/format";
import { SAMPLE_META, sampleDraft } from "@/lib/supportPlan/testFixtures";
import { SUPPORT_PLAN_PRINT_CSS } from "./printCss";
import {
  buildSupportPlanPrintHtml,
  PAGEDJS_SRC,
  PRINT_MESSAGE,
  SCREEN_PREVIEW_CSS,
} from "./printHtml";

/** 印刷用ページ（画面の sandbox の iframe に入れる1枚の HTML）。架空の利用者 K-014。 */

const html = (draft = sampleDraft(), title = "個別支援計画書（K-014）") =>
  buildSupportPlanPrintHtml(buildSupportPlanAView(draft, SAMPLE_META), title);

describe("印刷用ページ", () => {
  it("様式の10章の見出しがすべて入る", () => {
    const out = html();
    for (const ch of SUPPORT_PLAN_A_CHAPTERS) expect(out).toContain(ch);
  });

  it("ページ組みの道具（Paged.js）は段階1の試験と同じ版を読む", () => {
    expect(html()).toContain(`<script src="${PAGEDJS_SRC}">`);
    expect(PAGEDJS_SRC).toContain("pagedjs@0.4.3");
  });

  it("印刷は親の画面からの合図だけで開く（受け口が合図の送り主を確かめる）", () => {
    const out = html();
    expect(out).toContain(JSON.stringify(PRINT_MESSAGE));
    expect(out).toContain("e.source!==window.parent");
  });

  it("AI の返事に HTML が混ざっても、タグとしては書き出さない", () => {
    const draft = sampleDraft();
    draft.policy = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const out = html(draft);
    expect(out).not.toContain("<img src=x");
    expect(out).not.toContain("<script>alert(2)");
    expect(out).toContain("&lt;script&gt;");
  });

  it("題名の文字も書き出す前に無害にする", () => {
    expect(html(sampleDraft(), "</title><script>x</script>")).not.toContain("</title><script>x");
  });

  it('画面で見るときだけの見た目は media="screen" の style に分ける（Paged.js が @media screen を捨てるため・印刷には効かせない）', () => {
    expect(html()).toContain(`<style media="screen">${SCREEN_PREVIEW_CSS}</style>`);
    expect(SUPPORT_PLAN_PRINT_CSS).not.toContain("@media screen");
    expect(SUPPORT_PLAN_PRINT_CSS).not.toContain(".pagedjs_pages");
  });
});
