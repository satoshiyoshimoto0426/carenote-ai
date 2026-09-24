import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attrOf, elementsOf, hasClass, isReachable, textOf, within } from "@/tests/helpers/markup";
import Rail, { emailLocalPart } from "./Rail";

/**
 * 左の縦の帯（スマホでは下のタブ）components/shell/Rail.tsx を固定する。
 *
 * なぜ必要か:
 *   ナビを6項目から4項目にした（2026-09-23 吉本さん決定）が、古い URL（/rescue・/dashboard）は
 *   ブックマーク・マニュアル・撮影の道具が使っていて残る。古い URL を開いた人に「いまどこにいるか」が
 *   光らない壊れ方は、画面を見ないと気づけない。どの項目が光るかは lib/nav.ts の sectionOf が決め、
 *   ここではそれが画面の aria-current と緑の太い線に正しく出ることを確かめる。
 *
 * 偽物にするもの: next/navigation の usePathname（開いている URL）と、Clerk の UserButton / useUser。
 *
 * 描いた HTML は tests/helpers/markup.ts で木として読む（2026-09-24 に2つの枝を取り込んだときに寄せた）。
 * 項目の名前・短い名前は textOf（隠した要素の中の文字を数えない）、アカウントのボタンは isReachable で「出ている」を見る。
 */

const env = vi.hoisted(() => ({
  pathname: "/clients",
  email: "satoshi.test@example.com" as string | null,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => env.pathname,
}));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => createElement("div", { "data-user-button": "" }),
  useUser: () => ({
    isLoaded: true,
    user: env.email
      ? {
          primaryEmailAddress: { emailAddress: env.email },
          emailAddresses: [{ emailAddress: env.email }],
        }
      : null,
  }),
}));

/** ナビの項目の線の印（svg の属性）。光っているかは stroke-width、読み上げない飾りかは aria-hidden で見る。 */
type SvgMarks = { strokeWidth: string | undefined; ariaHidden: string | undefined };

/**
 * 描いた HTML からナビの項目（<a>）を取り出す。label は見る人にも読み上げにも届く文字（textOf）。
 * 隠された項目（自分や祖先に隠す印がある）は shown が false になる。
 */
function navLinks(
  html: string,
): { href: string; label: string; current: boolean; shown: boolean; svg: SvgMarks }[] {
  return elementsOf(html)
    .filter((el) => el.tagName === "a")
    .map((a) => {
      const [svg] = within(a, (el) => el.tagName === "svg");
      return {
        href: attrOf(a, "href") ?? "",
        label: textOf(a).trim(),
        current: attrOf(a, "aria-current") === "page",
        shown: isReachable(a),
        svg: {
          strokeWidth: svg ? attrOf(svg, "stroke-width") : undefined,
          ariaHidden: svg ? attrOf(svg, "aria-hidden") : undefined,
        },
      };
    });
}

function draw(pathname: string): string {
  env.pathname = pathname;
  return renderToStaticMarkup(createElement(Rail));
}

beforeEach(() => {
  env.pathname = "/clients";
  env.email = "satoshi.test@example.com";
});

describe("Rail（左の縦の帯・スマホでは下のタブ）", () => {
  it("利用者・つくる・点検・使い方の4項目を、この順と行き先で出す", () => {
    const links = navLinks(draw("/clients"));
    expect(links.every((l) => l.shown)).toBe(true);
    expect(links.map(({ label, href }) => [label, href])).toEqual([
      ["利用者", "/clients"],
      ["つくる", "/create"],
      ["点検", "/evaluate"],
      ["使い方", "/guide"],
    ]);
  });

  it("「メイン」という名前のナビとして読み上げる", () => {
    expect(draw("/clients")).toMatch(/<nav\b[^>]*aria-label="メイン"/);
  });

  it.each([
    ["/clients", "利用者"],
    ["/clients/abc", "利用者"],
    ["/create", "つくる"],
    // 旧・救済モードは「つくる」の中（一式まとめて）
    ["/rescue", "つくる"],
    ["/evaluate", "点検"],
    // 旧・ダッシュボード（評価の履歴）は「点検」の中
    ["/dashboard", "点検"],
    ["/guide", "使い方"],
  ])("%s を開くと「%s」だけが光る（aria-current と緑の太い線）", (pathname, label) => {
    const links = navLinks(draw(pathname));
    const current = links.filter((l) => l.current);
    expect(current.map((l) => l.label)).toEqual([label]);
    // 光っている項目の線は 1.8、ほかは 1.6
    for (const link of links) {
      expect(link.svg.strokeWidth).toBe(link.current ? "1.8" : "1.6");
      expect(link.svg.ariaHidden).toBe("true");
    }
  });

  it("どの項目でもない URL では、どれも光らせない", () => {
    expect(navLinks(draw("/")).some((l) => l.current)).toBe(false);
  });

  it("下端に Clerk のアカウントのボタンと、メールの「@」より前を文字で出す", () => {
    const html = draw("/clients");
    const els = elementsOf(html);
    const button = els.find((el) => attrOf(el, "data-user-button") !== undefined);
    expect(button && isReachable(button)).toBe(true);
    // 目で見える短い名前（読み上げには「ログイン中:」を添える）
    const id = els.find((el) => hasClass(el, "rail-user-id"));
    expect(id && textOf(id)).toBe("satoshi.test");
    expect(html).toMatch(/class="rail-user-id"[^>]*>.*ログイン中: <\/span>satoshi\.test<\/span>/);
    // aria-label を div に付けない（Biome useAriaPropsSupportedByRole が error・中身の文字で名前が付く）
    expect(html).not.toMatch(/<div\b[^>]*aria-label=/);
  });

  it("まだログイン情報が読めていないときは、短い名前の欄を出さない（空の欄を作らない）", () => {
    env.email = null;
    const html = draw("/clients");
    const button = elementsOf(html).find((el) => attrOf(el, "data-user-button") !== undefined);
    expect(button && isReachable(button)).toBe(true);
    expect(html).not.toContain("rail-user-id");
  });
});

describe("emailLocalPart", () => {
  it.each([
    ["satoshi@example.com", "satoshi"],
    ["a.b+c@x.jp", "a.b+c"],
    ["no-at-mark", "no-at-mark"],
    ["", ""],
    [null, ""],
    [undefined, ""],
  ] as const)("%s → %s", (email, local) => {
    expect(emailLocalPart(email)).toBe(local);
  });
});
