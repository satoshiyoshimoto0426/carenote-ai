import { beforeEach, describe, expect, it, vi } from "vitest";
import RootPage from "./page";

/**
 * 「/」の行き先（app/page.tsx）を固定する。
 *
 * なぜ必要か: ホームは利用者の一覧（吉本さん決定 2026-09-23）。行き先が古い画面（/evaluate）に戻ると、
 * マニュアルとナビの「最初に開く画面」の説明と食い違う。本物の redirect は例外を投げて描画を止めるので、
 * 呼ばれた行き先だけを記録する代役に差し替えて確かめる。
 */

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

beforeEach(() => {
  redirect.mockClear();
  vi.unstubAllEnvs();
});

describe("RootPage（/）", () => {
  it("印が無い今の CareNote 本番では、利用者の一覧（/clients）へ送る", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    RootPage();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/clients");
  });

  it("就労A型を単独で公開する版（NEXT_PUBLIC_SUPPORT_PLAN_A=on・決定②）では、計画書の画面だけへ送る", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    RootPage();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/support-plan-a");
  });

  it("前の名前（standalone）で設定してあっても、同じく計画書の画面へ送る", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "standalone");
    RootPage();
    expect(redirect).toHaveBeenCalledWith("/support-plan-a");
  });
});
