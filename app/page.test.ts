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
});

describe("RootPage（/）", () => {
  it("利用者の一覧（/clients）へ送る", () => {
    RootPage();
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/clients");
  });
});
