import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOpenPilotAt,
  isSupportPlanAEdition,
  isSupportPlanAOpen,
  PRODUCTION_HOSTS,
  pilotFlagBuildError,
  SUPPORT_PLAN_A_PATH,
  supportPlanAMode,
} from "./edition";

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
    for (const v of [undefined, "", "ON", "On", "true", "1", " on", "off", "OPEN", " open"]) {
      expect(isSupportPlanAEdition(v)).toBe(false);
      expect(isSupportPlanAOpen(v)).toBe(false);
    }
  });

  it("open は計画書だけの版で、しかもログインなし（2026-10-05 吉本さんの決定）", () => {
    expect(supportPlanAMode("open")).toBe("open");
    expect(isSupportPlanAEdition("open")).toBe(true);
    expect(isSupportPlanAOpen("open")).toBe(true);
  });

  it("on・standalone はログインが要るまま（ログインなしになるのは open だけ）", () => {
    for (const v of ["on", "standalone"]) {
      expect(supportPlanAMode(v)).toBe("login");
      expect(isSupportPlanAOpen(v)).toBe(false);
    }
    expect(supportPlanAMode(undefined)).toBe("off");
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

describe("本番の名前では、印が open でもログインなしにしない（独立審査 2026-10-08 中3）", () => {
  const PILOT = "carenote-xq96d2x2f-satoshiyoshimoto0426s-projects.vercel.app";

  it("試行版のデプロイの URL では開く", () => {
    expect(isOpenPilotAt(PILOT, "open", "carenote-ai.vercel.app")).toBe(true);
  });

  it("本番の名前（一覧の3つ・大文字でも）では開かない", () => {
    for (const host of [...PRODUCTION_HOSTS, "CareNote-AI.vercel.app"]) {
      expect(isOpenPilotAt(host, "open", undefined)).toBe(false);
    }
    expect(PRODUCTION_HOSTS).toContain("carenote-ai.vercel.app");
  });

  it("Vercel が渡す本番の名前（https:// つきでも）では開かない", () => {
    expect(isOpenPilotAt("my-carenote.example.jp", "open", "my-carenote.example.jp")).toBe(false);
    expect(isOpenPilotAt("my-carenote.example.jp", "open", "https://my-carenote.example.jp")).toBe(
      false,
    );
  });

  it("印が open でなければ、どこでも開かない", () => {
    for (const v of [undefined, "", "on", "standalone"]) {
      expect(isOpenPilotAt(PILOT, v, undefined)).toBe(false);
    }
  });
});

describe("ビルドの歯止め（GitHub からのビルドに計画書の印が入ったら止める）", () => {
  it("印があり、GitHub からのビルド（VERCEL_GIT_COMMIT_SHA あり）なら、止める理由を返す", () => {
    for (const v of ["open", "on", "standalone"]) {
      const err = pilotFlagBuildError({
        NEXT_PUBLIC_SUPPORT_PLAN_A: v,
        VERCEL_GIT_COMMIT_SHA: "abc123",
      });
      expect(err).toContain("ビルドを止めました");
    }
  });

  it("試行版の出し方（.git の無い置き場から CLI・SHA なし）と、印の無い本番のビルドは止めない", () => {
    expect(pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: "open" })).toBeNull();
    expect(pilotFlagBuildError({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBeNull();
    expect(
      pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: "", VERCEL_GIT_COMMIT_SHA: "abc123" }),
    ).toBeNull();
  });

  it("next.config.ts がこの歯止めを呼んでいる（外すとビルドで止まらなくなる）", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("pilotFlagBuildError(process.env)");
    expect(config).toMatch(/if \(pilotFlagError\) throw new Error\(pilotFlagError\)/);
  });
});
