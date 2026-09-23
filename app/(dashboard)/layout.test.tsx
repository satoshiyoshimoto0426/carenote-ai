import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

describe("DashboardLayout（外枠）", () => {
  it("4項目のナビ（左の帯・スマホでは下のタブ）を出す", () => {
    const nav = /<nav\b[^>]*aria-label="メイン"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
    for (const label of ["利用者", "つくる", "点検", "使い方"]) {
      expect(nav).toContain(`<span>${label}</span>`);
    }
  });

  it("上の帯に共有状態と事業所の切り替えを出し、共有していなければ注意を帯のすぐ下に出す", () => {
    expect(html).toContain("自分の登録分のみ");
    expect(html).toContain("data-org-switcher");
    expect(html).toMatch(/<\/header><div role="status" class="sharing-strip">/);
  });

  it("並びは [ナビ] [上の帯 → 本文 → 送り先の表示]（本文は上の帯より後）", () => {
    const at = (s: string) => html.indexOf(s);
    expect(at('aria-label="メイン"')).toBeLessThan(at('class="shell-head"'));
    expect(at('class="shell-head"')).toBeLessThan(at('<main class="app-main-inner">'));
    expect(at('<main class="app-main-inner">')).toBeLessThan(at('id="page"'));
    expect(at('id="page"')).toBeLessThan(at("Powered by Claude API"));
  });

  it("AI の送り先の表示を、どの画面にも出す", () => {
    expect(html).toContain("CareNote — Powered by Claude API");
  });

  it("旧い外枠（左メニュー・スマホ専用の帯・スマホ専用の共有表示）は残っていない", () => {
    for (const old of ["app-sidebar", "app-topbar", "app-sharing-mobile", "ダッシュボード"]) {
      expect(html).not.toContain(old);
    }
  });
});
