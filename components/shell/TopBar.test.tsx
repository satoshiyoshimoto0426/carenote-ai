import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CssNode, parseCss, stripCssComments } from "@/tests/helpers/cssTokens";
import TopBar, { SHELL_HEAD_HEIGHT_VAR } from "./TopBar";

/**
 * 上の帯 components/shell/TopBar.tsx を固定する（サーバーで描いた HTML ＝ ページが何も差し込む前）。
 *
 * なぜ必要か:
 *   - 名簿の共有状態（安全のための表示・独立審査 2026-09-13 critical）は、A案で左のメニューから
 *     この帯へ移った。ページが帯に何も差し込まなくても、共有状態と（共有していなければ）注意が
 *     必ず出ることをここで縛る。
 *   - 「この画面の使い方」の行き先は lib/nav.ts の helpAnchorOf が決める。古い URL（/rescue）と
 *     一式まとめて（/create?mode=bundle）が正しい章へ飛ぶことを、画面の <a> で確かめる。
 * 差し込み（TopBarSlot）で中身が入れ替わる動きは TopBarSlot.live.test.tsx が見る。
 */

const env = vi.hoisted(() => ({
  pathname: "/clients",
  search: "",
  org: { isLoaded: true, organization: null as { name: string } | null },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => env.pathname,
  useSearchParams: () => new URLSearchParams(env.search),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => env.org,
  OrganizationSwitcher: () => createElement("div", { "data-org-switcher": "" }),
}));

function draw(pathname: string, search = ""): string {
  env.pathname = pathname;
  env.search = search;
  return renderToStaticMarkup(createElement(TopBar));
}

/** 「この画面の使い方」のリンクの行き先（無ければ null）。 */
function helpHref(html: string): string | null {
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    if (m[2].includes("この画面の使い方")) return /href="([^"]*)"/.exec(m[1])?.[1] ?? "";
  }
  return null;
}

beforeEach(() => {
  env.org = { isLoaded: true, organization: null };
});

describe("TopBar（上の帯）", () => {
  it("ページが何も差し込まなくても、共有状態と事業所の切り替えを出す", () => {
    const html = draw("/create");
    expect(html).toContain("自分の登録分のみ");
    expect(html).toContain("data-org-switcher");
  });

  it("共有していないときは、帯のすぐ下に注意を role=status で出す", () => {
    const html = draw("/clients");
    expect(html).toMatch(/<\/header><div role="status" class="sharing-strip">/);
    expect(html).toContain("置き換わりません");
    expect(html).toContain("右上の事業所の切り替えから選んでください");
  });

  it("共有中は注意を出さず、事業所の名前を出す", () => {
    env.org = { isLoaded: true, organization: { name: "テスト事業所" } };
    const html = draw("/clients");
    expect(html).toContain("事業所で共有中");
    expect(html).toContain("テスト事業所");
    expect(html).not.toContain("sharing-strip");
  });

  it("読み込み中は「共有状態を確認中」で、注意は出さない（決めつけない）", () => {
    env.org = { isLoaded: false, organization: null };
    const html = draw("/clients");
    expect(html).toContain("共有状態を確認中");
    expect(html).not.toContain("sharing-strip");
  });

  it.each([
    ["/clients", "利用者"],
    ["/clients/abc", "利用者"],
    ["/rescue", "つくる"],
    ["/dashboard", "点検"],
    ["/guide", "使い方"],
  ])("差し込みが無いとき、%s では項目の名前「%s」を左に出す", (pathname, label) => {
    expect(draw(pathname)).toContain(`<span class="topbar-section">${label}</span>`);
  });

  it.each([
    ["/clients", "", "/guide#ch2"],
    ["/clients/abc", "", "/guide#ch2"],
    ["/create", "", "/guide#ch3"],
    ["/create", "client=abc&type=supportLog", "/guide#ch3"],
    // 一式まとめて（今は /rescue・後で /create?mode=bundle）は ch6
    ["/create", "mode=bundle", "/guide#ch6"],
    ["/rescue", "", "/guide#ch6"],
    ["/evaluate", "", "/guide#ch1"],
    ["/dashboard", "", "/guide#ch1"],
  ])("%s?%s の「この画面の使い方」は %s へ飛ぶ", (pathname, search, href) => {
    expect(helpHref(draw(pathname, search))).toBe(href);
  });

  it("使い方の画面では「この画面の使い方」を出さない", () => {
    const html = draw("/guide");
    expect(helpHref(html)).toBeNull();
    // それでも共有状態は出る
    expect(html).toContain("自分の登録分のみ");
  });
});

/**
 * 帯の高さを使う側（app/globals.css）が、TopBar が測って書く変数を読んでいるか。
 * 固定の数字（旧 72/76/80px）に戻すと、注意の帯が出ている時だけ「前へ／次へ」や章の見出しが
 * 帯の裏に潜る（2026-09-17 critical と同じ種類）。高さを「画面の高さ − 帯」の引き算で決めるのも、
 * 注意の帯の有無で下の端が画面の外へ出るのでやめた（計画の指摘）。どちらもここで止める。
 */
describe("帯の高さを読む CSS（app/globals.css）", () => {
  const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  /** @media の中まで降りて、選択子がちょうど selector の規則の宣言を全部集める。 */
  function declarationsOf(selector: string): string[] {
    const out: string[] = [];
    const visit = (nodes: CssNode[]) => {
      for (const node of nodes) {
        if (node.prelude.trim() === selector) out.push(node.declarations);
        visit(node.children);
      }
    };
    visit(parseCss(CSS));
    return out;
  }

  it.each([
    [".presend-nav", "top"],
    [".shell-anchor", "scroll-margin-top"],
  ])("%s の %s は、どの幅でも測った高さ（--shell-head-h）から決める", (selector, property) => {
    const values = declarationsOf(selector).flatMap((body) =>
      [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((m) =>
        m[1].trim(),
      ),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toContain(`var(${SHELL_HEAD_HEIGHT_VAR}`);
  });

  it("高さを「画面の高さ − 何か」の引き算で決めていない", () => {
    expect(stripCssComments(CSS)).not.toMatch(/calc\(\s*100d?vh\s*-/);
  });
});
