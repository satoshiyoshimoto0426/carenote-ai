import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attrOf, elementsOf, isReachable, textOf } from "@/tests/helpers/markup";
import SupportPlanALayout from "./layout";
import SupportPlanAPage from "./page";

/**
 * 就労A型の個別支援計画書の画面だけの外枠（app/support-plan-a/layout.tsx）と入口（page.tsx）。
 *
 * なぜ必要か: 2026-10-03 吉本さんの決定②「単独で出す」。印 NEXT_PUBLIC_SUPPORT_PLAN_A が無い今の CareNote 本番で
 *   この画面（や画面の名前）が出てしまう・単独の版でログアウトの道が無い・CareNote のナビが混ざる、を止める。
 * 「出ている」は描いた HTML を tests/helpers/markup.ts で木として読んで確かめる（textOf・isReachable）。
 */

/** 本物の notFound と同じく、呼ばれたら例外で描画を止める代役 */
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);

vi.mock("next/navigation", () => ({ notFound }));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => createElement("div", { "data-user-button": "" }),
}));

/** 画面の部品は重いので代役にする（入口が何を返すかだけを見る） */
vi.mock("@/components/supportPlan/SupportPlanAWorkbench", () => ({
  default: () => createElement("div", { id: "workbench" }, "計画書の作業台"),
}));

const renderLayout = () =>
  renderToStaticMarkup(
    createElement(SupportPlanALayout, null, createElement("p", { id: "page" }, "ページの中身")),
  );

beforeEach(() => {
  notFound.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("計画書の画面の外枠（印が on の版）", () => {
  it("上に画面の名前と、ログアウトのためのアカウントのボタンを出し、その下に中身を出す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const els = elementsOf(renderLayout());
    const header = els.find((el) => el.tagName === "header");
    expect(header && isReachable(header) ? textOf(header) : "").toContain(
      "個別支援計画（就労A型）",
    );
    const userButtons = els.filter(
      (el) => attrOf(el, "data-user-button") !== undefined && isReachable(el),
    );
    expect(userButtons).toHaveLength(1);
    const main = els.find((el) => el.tagName === "main");
    expect(main ? textOf(main) : "").toContain("ページの中身");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("CareNote の外枠の部品（ナビ・名簿の共有状態・送り先の表示）は入れない", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const html = renderLayout();
    for (const shell of [
      "rail-item",
      'aria-label="メイン"',
      "sharing-strip",
      "Powered by Claude API",
    ]) {
      expect(html).not.toContain(shell);
    }
  });
});

describe("印が無い今の CareNote 本番", () => {
  it("外枠ごと 404 にする（画面の名前も出さない）", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    expect(renderLayout).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("入口（page.tsx）も 404 にする（外枠だけの見張りに頼らない）", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    expect(() => SupportPlanAPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("印が on なら、入口は計画書の作業台を出す", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const html = renderToStaticMarkup(SupportPlanAPage());
    expect(textOf(elementsOf(html)[0])).toContain("計画書の作業台");
    expect(notFound).not.toHaveBeenCalled();
  });
});
