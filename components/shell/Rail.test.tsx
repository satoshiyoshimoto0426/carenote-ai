import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

/** 描いた HTML からナビの項目（<a>）を取り出す。label は中の文字（タグを除いたもの）。 */
function navLinks(html: string): { href: string; label: string; current: boolean; svg: string }[] {
  const out: { href: string; label: string; current: boolean; svg: string }[] = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = m[1];
    const inner = m[2];
    out.push({
      href: /href="([^"]*)"/.exec(attrs)?.[1] ?? "",
      label: inner.replace(/<[^>]+>/g, "").trim(),
      current: /aria-current="page"/.test(attrs),
      svg: /<svg\b[^>]*>/.exec(inner)?.[0] ?? "",
    });
  }
  return out;
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
      expect(link.svg).toContain(`stroke-width="${link.current ? "1.8" : "1.6"}"`);
      expect(link.svg).toContain('aria-hidden="true"');
    }
  });

  it("どの項目でもない URL では、どれも光らせない", () => {
    expect(navLinks(draw("/")).some((l) => l.current)).toBe(false);
  });

  it("下端に Clerk のアカウントのボタンと、メールの「@」より前を文字で出す", () => {
    const html = draw("/clients");
    expect(html).toContain("data-user-button");
    // 目で見える短い名前（読み上げには「ログイン中:」を添える）
    expect(html).toMatch(/class="rail-user-id"[^>]*>.*ログイン中: <\/span>satoshi\.test<\/span>/);
    // aria-label を div に付けない（Biome useAriaPropsSupportedByRole が error・中身の文字で名前が付く）
    expect(html).not.toMatch(/<div\b[^>]*aria-label=/);
  });

  it("まだログイン情報が読めていないときは、短い名前の欄を出さない（空の欄を作らない）", () => {
    env.email = null;
    const html = draw("/clients");
    expect(html).toContain("data-user-button");
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
