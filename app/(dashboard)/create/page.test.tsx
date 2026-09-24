import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DOC_ORDER, DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import CreatePage from "./page";

/**
 * つくる（/create）を開いた直後の見た目のうち、A案（R1・2026-09-24）で足した物を固定する。
 *
 * なぜ必要か:
 *   - 左の帯から「救済モード」の項目が無くなった（ナビ4項目・吉本さん決定 2026-09-23）。一式まとめて（救済モード）へ
 *     行けるのは、つくるのタブの行の右端のリンクだけになった。これが消えると、救済モードへ画面からは行けなくなる
 *     （URL を直接打つ人はいない）。
 *   - そのリンクをタブの並び（role="tablist"）の中に入れると、読み上げソフトがタブの1つとして数える（計画の指摘 2026-09-23）。
 *   - タブの文字は、マニュアルと撮影の道具（tools/shoot-plans.mjs）がボタンを探す手がかり。1文字でも変わると手順が外れる。
 * 押したあとの動き（種類の切り替え・送る前に見る）は変えていないので、ここでは最初の描画だけを見る。
 */

const html = renderToStaticMarkup(<CreatePage />);

/** role="tablist" の要素の中身（開きタグから、対応する閉じタグまで）。タブの中にボタン以外の入れ子は無い。 */
function tablistMarkup(markup: string): string {
  const start = markup.indexOf('role="tablist"');
  expect(start).toBeGreaterThan(-1);
  const open = markup.lastIndexOf("<div", start);
  const close = markup.indexOf("</div>", start);
  return markup.slice(open, close + "</div>".length);
}

describe("つくるを開いた直後", () => {
  it("一式まとめて（救済モード）へのリンク（/rescue）がある", () => {
    expect(html).toMatch(/<a [^>]*href="\/rescue"[^>]*>一式まとめて（救済モード）<\/a>/);
  });

  it("そのリンクは、書類の種類のタブの並び（tablist）の外にある", () => {
    const tablist = tablistMarkup(html);
    expect(tablist).not.toContain("/rescue");
    expect(tablist).not.toContain("<a ");
  });

  it("タブは5つで、並びと文字は lib/create/docTypes.ts のとおり", () => {
    const tabs = [
      ...tablistMarkup(html).matchAll(/<button [^>]*role="tab"[^>]*>([^<]*)<\/button>/g),
    ].map((m) => m[1]);
    expect(tabs).toEqual(DOC_ORDER.map((t) => DOC_TYPE_LABELS[t].tab));
  });

  it("選んでいるタブは1つだけで、最初はケアプラン（以前の既定と同じ）。キーボードで入れるのもそのタブだけ", () => {
    const selected = [
      ...html.matchAll(/<button [^>]*aria-selected="true"[^>]*>([^<]*)<\/button>/g),
    ];
    expect(selected.map((m) => m[1])).toEqual([DOC_TYPE_LABELS.carePlan.tab]);
    expect(selected[0][0]).toContain('tabindex="0"');
    expect(html.match(/tabindex="-1"/g)?.length).toBe(DOC_ORDER.length - 1);
  });

  it("タブの中身の区画は、選んでいるタブを名前にしている（aria-labelledby）", () => {
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="doc-tab-carePlan"/);
  });

  it("送る前の約束の一文と、下書きを作るボタンの文字は以前のまま", () => {
    expect(html).toContain("押しても、すぐには送られません。送る前に確認画面が出ます。");
    expect(html).toContain(`${DOC_TYPE_LABELS.carePlan.tab}の下書きを作る`);
  });
});
