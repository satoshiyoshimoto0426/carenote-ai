import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type CssNode, parseCss, stripCssComments } from "@/tests/helpers/cssTokens";
import {
  attrOf,
  elementsOf,
  hasClass,
  isReachable,
  type MarkupElement,
  textOf,
} from "@/tests/helpers/markup";
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
 *
 * 「出ている」は描いた HTML を tests/helpers/markup.ts で木として読んで確かめる（2026-09-24 に2つの枝を取り込んだときに寄せた）:
 * 文字は textOf（隠した要素の中の文字を数えない）、切り替えや注意の帯は isReachable（自分や祖先が隠れていたら数えない）。
 * 「出していない」は、隠して出した物も拾えるよう、描いた HTML 全体で見る。
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

/**
 * 描いた帯を木として読み、見るところ（帯全体の届く文字・隠されずに出ている切り替えと注意の帯・左の項目名）を取り出す。
 * 帯全体 = いちばん外側の要素（.shell-head。上の帯と、その下の注意の帯を包む）。
 */
function view(html: string) {
  const els = elementsOf(html);
  const shown = (el: MarkupElement | undefined) => (el && isReachable(el) ? el : undefined);
  const section = shown(els.find((el) => hasClass(el, "topbar-section")));
  return {
    /** 帯の中で、見る人にも読み上げにも届く文字 */
    text: els.length > 0 ? textOf(els[0]) : "",
    /** 隠されずに出ている事業所の切り替えの数 */
    switchers: els.filter((el) => attrOf(el, "data-org-switcher") !== undefined && isReachable(el))
      .length,
    /** 隠されずに出ている注意の帯（role="status"） */
    strip: shown(
      els.find((el) => attrOf(el, "role") === "status" && hasClass(el, "sharing-strip")),
    ),
    /** 左に出ている項目の名前（出ていなければ ""） */
    section: section ? textOf(section) : "",
  };
}

/** 「この画面の使い方」のリンクの行き先（隠されずに出ていなければ null）。 */
function helpHref(html: string): string | null {
  const link = elementsOf(html).find(
    (el) => el.tagName === "a" && textOf(el).includes("この画面の使い方"),
  );
  return link ? (attrOf(link, "href") ?? "") : null;
}

beforeEach(() => {
  env.org = { isLoaded: true, organization: null };
});

describe("TopBar（上の帯）", () => {
  it("ページが何も差し込まなくても、共有状態と事業所の切り替えを出す", () => {
    const v = view(draw("/create"));
    expect(v.text).toContain("自分の登録分のみ");
    expect(v.switchers).toBe(1);
  });

  it("共有していないときは、帯のすぐ下に注意を role=status で出す", () => {
    const html = draw("/clients");
    // 置き場所: 上の帯（header）のすぐ後ろ
    expect(html).toMatch(/<\/header><div role="status" class="sharing-strip">/);
    const { strip } = view(html);
    expect(strip).toBeDefined();
    const said = strip ? textOf(strip) : "";
    expect(said).toContain("置き換わりません");
    expect(said).toContain("右上の事業所の切り替えから選んでください");
  });

  it("共有中は注意を出さず、事業所の名前を出す", () => {
    env.org = { isLoaded: true, organization: { name: "テスト事業所" } };
    const html = draw("/clients");
    const v = view(html);
    expect(v.text).toContain("事業所で共有中");
    expect(v.text).toContain("テスト事業所");
    expect(html).not.toContain("sharing-strip");
  });

  it("読み込み中は「共有状態を確認中」で、注意は出さない（決めつけない）", () => {
    env.org = { isLoaded: false, organization: null };
    const html = draw("/clients");
    expect(view(html).text).toContain("共有状態を確認中");
    expect(html).not.toContain("sharing-strip");
  });

  it.each([
    ["/clients", "利用者"],
    ["/clients/abc", "利用者"],
    ["/rescue", "つくる"],
    ["/dashboard", "点検"],
    ["/guide", "使い方"],
  ])("差し込みが無いとき、%s では項目の名前「%s」を左に出す", (pathname, label) => {
    expect(view(draw(pathname)).section).toBe(label);
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
    // 隠して出しても落ちるよう、HTML 全体で見る
    expect(html).not.toContain("この画面の使い方");
    // それでも共有状態は出る
    expect(view(html).text).toContain("自分の登録分のみ");
  });
});

/**
 * 帯の高さを使う側（app/globals.css）が、TopBar が測って書く変数を読んでいるか。
 * 固定の数字（旧 72/76/80px）に戻すと、注意の帯が出ている時だけ「前へ／次へ」や章の見出しが
 * 帯の裏に潜る（2026-09-17 critical と同じ種類）。高さを「画面の高さ − 帯」の引き算で決めるのも、
 * 注意の帯の有無で下の端が画面の外へ出るのでやめた（計画の指摘）。どちらもここで止める。
 *
 * A3 の検証の追補: キーボードで移った先（フォーカス）も、上の帯とスマホの下のタブの裏に隠れていた
 * （WCAG 2.2 AA 2.4.11。375px で帯やタブの裏のボタンに focus() しても画面が動かなかった）。
 * 文書（html）の scroll-padding で上下を空けているかも、ここで縛る。
 */
describe("帯の高さを読む CSS（app/globals.css）", () => {
  const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

  /**
   * @media / @layer の中まで降りて、選択子がちょうど selector の規則の宣言を集める。
   * within を渡すと、前置き（`@media (…)` など）がそれに合うまとまりの中にある規則だけを集める。
   */
  function declarationsOf(selector: string, within?: RegExp): string[] {
    const out: string[] = [];
    const visit = (nodes: CssNode[], inside: boolean) => {
      for (const node of nodes) {
        const here = inside || (within?.test(node.prelude) ?? false);
        if (node.prelude.trim() === selector && (within === undefined || here)) {
          out.push(node.declarations);
        }
        visit(node.children, here);
      }
    };
    visit(parseCss(CSS), false);
    return out;
  }

  /** 宣言の並びから、property の値を全部取り出す。 */
  function valuesOf(bodies: string[], property: string): string[] {
    return bodies.flatMap((body) =>
      [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map((m) =>
        m[1].trim(),
      ),
    );
  }

  /** 選択子 selector の規則が property: value を持っている @media の前置きを集める（層の外なら ""）。 */
  function mediaHaving(selector: string, property: string, value: RegExp): string[] {
    const out: string[] = [];
    const visit = (nodes: CssNode[], media: string) => {
      for (const node of nodes) {
        const here = node.prelude.startsWith("@media") ? node.prelude : media;
        if (
          node.prelude.trim() === selector &&
          valuesOf([node.declarations], property).some((v) => value.test(v))
        ) {
          out.push(here);
        }
        visit(node.children, here);
      }
    };
    visit(parseCss(CSS), "");
    return out;
  }

  it.each([
    [".presend-nav", "top"],
    // フォーカスした部品・使い方の章の飛び先（/guide#chN）を、帯の 8px 下に止める
    ["html", "scroll-padding-top"],
  ])("%s の %s は、固定の数字でなく測った高さ（--shell-head-h）から決める（768px 以上の区画の中は --sticky-top が先 ── primitives.test.tsx）", (selector, property) => {
    const values = valuesOf(declarationsOf(selector), property);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(value).toContain(`var(${SHELL_HEAD_HEIGHT_VAR}`);
  });

  it("スマホでは、下のタブの高さと iPhone の下端（safe-area）の上に、フォーカスした部品を止める", () => {
    const values = valuesOf(declarationsOf("html", /^@media\b/), "scroll-padding-bottom");
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value).toContain("var(--tabbar-h)");
      expect(value).toContain("env(safe-area-inset-bottom)");
    }
  });

  it("下を空ける幅は、下のタブを画面の下に固定する幅と同じ（片方だけ変えると、隠れる幅か無駄に空く幅ができる）", () => {
    const tabBar = mediaHaving(".rail", "position", /^fixed$/);
    const padded = mediaHaving("html", "scroll-padding-bottom", /--tabbar-h/);
    expect(tabBar.length).toBeGreaterThan(0);
    expect(padded).toEqual(tabBar);
  });

  it("帯の高さを scroll-margin でも足していない（html の scroll-padding-top と足し算になり、二重に下がる）", () => {
    expect(stripCssComments(CSS)).not.toMatch(
      new RegExp(`scroll-margin[a-z-]*\\s*:[^;]*${SHELL_HEAD_HEIGHT_VAR}`),
    );
  });

  it("高さを「画面の高さ − 何か」の引き算で決めていない", () => {
    expect(stripCssComments(CSS)).not.toMatch(/calc\(\s*100d?vh\s*-/);
  });
});
