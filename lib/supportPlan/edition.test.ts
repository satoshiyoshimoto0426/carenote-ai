import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOpenPilotAt,
  isSupportPlanAEdition,
  isSupportPlanAOpen,
  PILOT_BUILD_MARKER,
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

describe("ログインなしの道は、開いてよい名前（試行版のデプロイごとの URL）でだけ開く（独立審査 2026-10-08 中3・再審査 小1）", () => {
  const PILOT = "carenote-abcd1234e-satoshiyoshimoto0426s-projects.vercel.app";

  it("試行版のデプロイごとの URL（大文字でも）と、手元の確認（localhost）では開く", () => {
    expect(isOpenPilotAt(PILOT, "open")).toBe(true);
    expect(isOpenPilotAt(PILOT.toUpperCase(), "open")).toBe(true);
    expect(isOpenPilotAt("localhost", "open")).toBe(true);
    expect(isOpenPilotAt("127.0.0.1", "open")).toBe(true);
  });

  it("本番の名前（一覧の3つ）・知らない別名・末尾の点つき・よく似た偽の名前では開かない", () => {
    for (const host of [
      ...PRODUCTION_HOSTS,
      "carenote-ai.vercel.app.",
      `${PILOT}.`,
      "my-carenote.example.jp",
      "carenote-ai-git-feat-supp-0d6b39-satoshiyoshimoto0426s-projects.vercel.app",
      `evil-${PILOT}`,
      `${PILOT}.evil.example`,
      "carenote-abcd1234e-someone-else.vercel.app",
    ]) {
      expect(isOpenPilotAt(host, "open"), host).toBe(false);
    }
    expect(PRODUCTION_HOSTS).toContain("carenote-ai.vercel.app");
  });

  it("印が open でなければ、どこでも開かない", () => {
    for (const v of [undefined, "", "on", "standalone"]) {
      expect(isOpenPilotAt(PILOT, v)).toBe(false);
      expect(isOpenPilotAt("localhost", v)).toBe(false);
    }
  });
});

describe("ビルドの歯止め（試行版の出し方でないビルドに計画書の印が入ったら止める）", () => {
  it("印があるのに目印（SUPPORT_PLAN_A_PILOT_BUILD=1）が無ければ止める ── 設定に頼らず止める側に倒れる（再審査 中4）", () => {
    for (const v of ["open", "on", "standalone"]) {
      const err = pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: v });
      expect(err, v).toContain("ビルドを止めました");
    }
    expect(
      pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: "open", [PILOT_BUILD_MARKER]: "yes" }),
    ).not.toBeNull();
  });

  it("目印があっても、GitHub からのビルド（VERCEL_GIT_COMMIT_SHA あり）なら止める", () => {
    const err = pilotFlagBuildError({
      NEXT_PUBLIC_SUPPORT_PLAN_A: "open",
      [PILOT_BUILD_MARKER]: "1",
      VERCEL_GIT_COMMIT_SHA: "abc123",
    });
    expect(err).toContain("ビルドを止めました");
  });

  it("試行版の出し方（目印あり・SHA なし）と、印の無いビルドは止めない", () => {
    expect(
      pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: "open", [PILOT_BUILD_MARKER]: "1" }),
    ).toBeNull();
    expect(pilotFlagBuildError({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBeNull();
    expect(pilotFlagBuildError({})).toBeNull();
    expect(
      pilotFlagBuildError({ NEXT_PUBLIC_SUPPORT_PLAN_A: "", VERCEL_GIT_COMMIT_SHA: "abc123" }),
    ).toBeNull();
  });

  it("next.config.ts がこの歯止めを呼び、公開の手順書の枠が目印を付けている（どちらかを外すと試行版が出せない／止まらない）", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain("pilotFlagBuildError(process.env)");
    expect(config).toContain("if (pilotFlagError) throw new Error(pilotFlagError)");
    const deploy = readFileSync(
      join(process.cwd(), "docs", "specs", "support-plan-a", "DEPLOY.md"),
      "utf8",
    );
    const deployLines = deploy.split("\n").filter((l) => l.includes(" deploy --cwd "));
    expect(deployLines.length).toBeGreaterThan(0);
    for (const l of deployLines) expect(l).toContain(`-b ${PILOT_BUILD_MARKER}=1`);
  });
});
