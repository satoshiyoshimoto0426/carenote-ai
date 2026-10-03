import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PLANS } from "../../tools/shoot-plans.mjs";
import { parseVideoScript } from "./videoScript";

/**
 * 就労A型の個別支援計画書の操作動画（本体マニュアルとは別の1本）の台本と撮影手順がズレないことを固定する。
 * 台本 = docs/specs/support-plan-a/VIDEO-SCRIPT.md、撮影手順 = tools/shoot-plans.mjs の spa1。
 * 場面が台本にあるのに撮っていない（または逆）と、make-video.mjs が画面の無い場面を作れずに止まる。
 */

const SCRIPT = readFileSync(
  join(process.cwd(), "docs", "specs", "support-plan-a", "VIDEO-SCRIPT.md"),
  "utf8",
);
const chapters = parseVideoScript(SCRIPT);
const MAIN = parseVideoScript(
  readFileSync(join(process.cwd(), "docs", "MANUAL-VIDEO-SPEC.md"), "utf8"),
);

describe("計画書の動画の台本", () => {
  it("章は spa1 の1本だけ（本体マニュアルの章 chN を混ぜない）", () => {
    expect(chapters.map((c) => c.slug)).toEqual(["spa1"]);
    expect(MAIN.some((c) => c.slug.startsWith("spa"))).toBe(false);
  });

  it("見出しに書いた場面の数と、表の行の数が一致する", () => {
    const declared = /（約\d+分・(\d+)場面）/.exec(SCRIPT);
    expect(declared).not.toBeNull();
    expect(chapters[0].scenes).toHaveLength(Number(declared?.[1]));
  });

  it("1本は5分以内（本体マニュアルと同じ決まり）", () => {
    const seconds = chapters[0].scenes.reduce((s, sc) => s + sc.seconds, 0);
    expect(seconds).toBeLessThanOrEqual(300);
  });

  it("台本のすべての場面を、撮影手順が1回ずつ撮る", () => {
    const shots = (PLANS.spa1 as { shoot?: number }[])
      .filter((s) => s.shoot !== undefined)
      .map((s) => s.shoot);
    expect(shots).toEqual(chapters[0].scenes.map((s) => s.index));
  });

  it("ナレーションに略語「サビ管」を使わない（合成音声の読み間違いを避ける）", () => {
    for (const s of chapters[0].scenes) expect(s.narration).not.toContain("サビ管");
  });
});
