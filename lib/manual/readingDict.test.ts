import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { READING_DICT, riskyOverlaps, toReadingTone, unusedSurfaces } from "./readingDict";
import { parseVideoScript } from "./videoScript";

/**
 * 読み辞書が「静かに壊れる」のを防ぐ検査。
 *
 * この辞書は合成の**前に文字列を置き換える**ので、間違えると台本そのものが壊れる。
 * しかも壊れたことは音を聞くまで分からない（2026-09-16 の読み間違い50件はそうやって見逃した）。
 * だから機械で分かる範囲 ── 台本に無い語・別の語を巻き込む重なり・読みに漢字が混じる ──
 * はここで落とす。
 */

const SPEC = readFileSync(join(process.cwd(), "docs", "MANUAL-VIDEO-SPEC.md"), "utf8");
const CORPUS = parseVideoScript(SPEC).flatMap((c) => c.scenes.map((s) => s.narration));

describe("読み辞書", () => {
  it("どの語も台本に実際に出てくる（消し忘れが残らない）", () => {
    expect(unusedSurfaces(CORPUS)).toEqual([]);
  });

  it("読みはかなだけ（漢字が混じると置き換えた意味が無い）", () => {
    for (const e of READING_DICT) {
      expect(e.reading, `${e.surface} の読み`).toMatch(/^[ぁ-んァ-ヶーぁ-ゖ、 ]+$/u);
    }
  });

  it("ある語が別の語の一部になっていない（先に食われて壊れるため）", () => {
    expect(riskyOverlaps()).toEqual([]);
  });

  it("同じ語を二重に登録していない", () => {
    const seen = new Set<string>();
    for (const e of READING_DICT) {
      expect(seen.has(e.surface), `${e.surface} が重複`).toBe(false);
      seen.add(e.surface);
    }
  });

  it("どの語にも、なぜ要るのかの根拠が書いてある", () => {
    for (const e of READING_DICT) {
      expect(e.why.length, `${e.surface} の根拠`).toBeGreaterThan(0);
    }
  });

  it("MiniMax へ渡す形は「元の文字列/読み」で、長い語が先に来る", () => {
    const tone = toReadingTone();
    expect(tone).toHaveLength(READING_DICT.length);
    for (const line of tone) expect(line).toMatch(/^[^/]+\/[^/]+$/);
    const lengths = tone.map((t) => t.slice(0, t.indexOf("/")).length);
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a));
  });
});
