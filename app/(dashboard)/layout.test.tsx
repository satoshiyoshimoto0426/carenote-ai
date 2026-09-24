import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { attrOf, elementsOf, hasClass, isReachable, textOf } from "@/tests/helpers/markup";
import DashboardLayout from "./layout";

/**
 * ログイン後の全画面の外枠 app/(dashboard)/layout.tsx を固定する。
 *
 * なぜ必要か:
 *   名簿の共有状態（安全のための表示・独立審査 2026-09-13 critical）は、A案で**ページではなく外枠**に
 *   置いた。外枠から外れると、どのページにも出なくなる（ページのテストは外枠を描かないので気づけない）。
 *   同じく、4項目のナビ（スマホで利用者・つくるへ行ける唯一の道）と、AI の送り先の表示
 *   「CareNote — Powered by Claude API」（送る帯の表示に置き換わるまで残す）も外枠が持つ。
 *   旧 layout.tsx のテストは無く、左メニューとスマホ用の2か所に分かれていた。
 *
 * 「出ている」は描いた HTML を tests/helpers/markup.ts で木として読んで確かめる（2026-09-24 に2つの枝を取り込んだときに寄せた）:
 * 文字は textOf（隠した要素の中の文字を数えない）、切り替えと注意の帯は isReachable。「残っていない」は HTML 全体で見る。
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/create",
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => ({ isLoaded: true, organization: null }),
  OrganizationSwitcher: () => createElement("div", { "data-org-switcher": "" }),
  UserButton: () => createElement("div", { "data-user-button": "" }),
  useUser: () => ({ isLoaded: true, user: null }),
}));

const html = renderToStaticMarkup(
  createElement(DashboardLayout, null, createElement("p", { id: "page" }, "ページの中身")),
);

/** 描いた外枠の要素（隠した要素も含む。数えるときは isReachable で絞る） */
const els = elementsOf(html);
/** 外枠の中で、見る人にも読み上げにも届く文字 */
const shownText = els.length > 0 ? textOf(els[0]) : "";

describe("DashboardLayout（外枠）", () => {
  it("4項目のナビ（左の帯・スマホでは下のタブ）を出す", () => {
    const nav = els.find((el) => el.tagName === "nav" && attrOf(el, "aria-label") === "メイン");
    expect(nav && isReachable(nav)).toBe(true);
    const labels = els
      .filter((el) => el.tagName === "a" && hasClass(el, "rail-item"))
      .map((a) => textOf(a));
    expect(labels).toEqual(["利用者", "つくる", "点検", "使い方"]);
  });

  it("上の帯に共有状態と事業所の切り替えを出し、共有していなければ注意を帯のすぐ下に出す", () => {
    expect(shownText).toContain("自分の登録分のみ");
    const switchers = els.filter(
      (el) => attrOf(el, "data-org-switcher") !== undefined && isReachable(el),
    );
    expect(switchers).toHaveLength(1);
    expect(html).toMatch(/<\/header><div role="status" class="sharing-strip">/);
    const strip = els.find(
      (el) => attrOf(el, "role") === "status" && hasClass(el, "sharing-strip"),
    );
    expect(strip && isReachable(strip) ? textOf(strip) : "").toContain("置き換わりません");
  });

  it("並びは [ナビ] [上の帯 → 本文 → 送り先の表示]（本文は上の帯より後）", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('aria-label="メイン"')).toBeLessThan(at('class="shell-head"'));
    expect(at('class="shell-head"')).toBeLessThan(at('<main class="app-main-inner">'));
    expect(at('<main class="app-main-inner">')).toBeLessThan(at('id="page"'));
    expect(at('id="page"')).toBeLessThan(at("Powered by Claude API"));
  });

  it("AI の送り先の表示を、どの画面にも出す", () => {
    expect(shownText).toContain("CareNote — Powered by Claude API");
  });

  it("旧い外枠（左メニュー・スマホ専用の帯・スマホ専用の共有表示）は残っていない", () => {
    for (const old of ["app-sidebar", "app-topbar", "app-sharing-mobile", "ダッシュボード"]) {
      expect(html).not.toContain(old);
    }
  });
});
