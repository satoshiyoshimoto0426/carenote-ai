import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupportPlanAEdition, SUPPORT_PLAN_A_PATH } from "./edition";

/**
 * 計画書を単独で公開する版の印（NEXT_PUBLIC_SUPPORT_PLAN_A）。
 * 印が無い今の CareNote 本番で計画書の画面が出てしまう・CareNote の画面が計画書へ送られる、を止める。
 */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("単独で公開する版の印", () => {
  it("on のときだけ（前の名前の standalone も同じ意味で）単独の版になる", () => {
    expect(isSupportPlanAEdition("on")).toBe(true);
    expect(isSupportPlanAEdition("standalone")).toBe(true);
  });

  it("未設定・打ち間違い（大文字・true・空白つき）は今の CareNote のまま", () => {
    for (const v of [undefined, "", "ON", "On", "true", "1", " on", "off"]) {
      expect(isSupportPlanAEdition(v)).toBe(false);
    }
  });

  it("引数を省くと、ビルド時の環境の値を読む", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    expect(isSupportPlanAEdition()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    expect(isSupportPlanAEdition()).toBe(false);
  });

  it("振り分けの行き先の道に、実際に画面のファイルがある（道の名前と置き場所がずれると、送った先が 404 になる）", () => {
    const page = join(process.cwd(), "app", ...SUPPORT_PLAN_A_PATH.split("/").filter(Boolean));
    expect(existsSync(join(page, "page.tsx"))).toBe(true);
  });
});
