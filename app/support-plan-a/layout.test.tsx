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

/** 画面を開いた名前（host）。既定は試行版のデプロイごとの URL の形 */
const PILOT_HOST = "carenote-abcd1234e-satoshiyoshimoto0426s-projects.vercel.app";
const request = vi.hoisted(() => ({ host: "" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: request.host }) }));

vi.mock("@clerk/nextjs", () => ({
  UserButton: () => createElement("div", { "data-user-button": "" }),
}));

/** 画面の部品は重いので代役にする（入口が何を返すかだけを見る） */
vi.mock("@/components/supportPlan/SupportPlanAWorkbench", () => ({
  default: () => createElement("div", { id: "workbench" }, "計画書の作業台"),
}));

const renderLayout = async () =>
  renderToStaticMarkup(
    await SupportPlanALayout({ children: createElement("p", { id: "page" }, "ページの中身") }),
  );

beforeEach(() => {
  notFound.mockClear();
  request.host = PILOT_HOST;
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("計画書の画面の外枠（印が on の版）", () => {
  it("上に画面の名前と、ログアウトのためのアカウントのボタンを出し、その下に中身を出す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const els = elementsOf(await renderLayout());
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

  it("CareNote の外枠の部品（ナビ・名簿の共有状態・送り先の表示）は入れない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const html = await renderLayout();
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

describe("ログインなしの試行版（印 open）", () => {
  it("上の帯の下に「架空のデータだけで」の注意を出す（名簿が無く名前が自動で置き換わらないため）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    const notes = elementsOf(await renderLayout()).filter(
      (el) => attrOf(el, "role") === "note" && isReachable(el),
    );
    expect(notes).toHaveLength(1);
    expect(textOf(notes[0])).toContain("架空の利用者・架空の面談だけ");
    expect(textOf(notes[0])).toContain("ログインなし");
  });

  it("ログインが要る版（on）では、その注意は出さない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const notes = elementsOf(await renderLayout()).filter((el) => attrOf(el, "role") === "note");
    expect(notes).toHaveLength(0);
  });

  it("本番の名前で開いたとき（ログインが要る）は、印が open でも「ログインなし」の注意を出さない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    request.host = "carenote-ai.vercel.app";
    const notes = elementsOf(await renderLayout()).filter((el) => attrOf(el, "role") === "note");
    expect(notes).toHaveLength(0);
  });
});

describe("印が無い今の CareNote 本番", () => {
  it("外枠ごと 404 にする（画面の名前も出さない）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    await expect(renderLayout()).rejects.toThrow("NEXT_NOT_FOUND");
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
