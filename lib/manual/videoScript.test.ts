import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_CHAPTERS } from "./content";
import { buildVtt, parseVideoScript, totalSeconds } from "./videoScript";

/**
 * 台本（docs/MANUAL-VIDEO-SPEC.md §5）と字幕の下書きがズレないことを固定する。
 * 台本は収録の唯一の正本なので、読み取りが静かに壊れる（場面が抜ける・秒がゼロになる）と
 * 「台本どおりに撮ったのに字幕が足りない」動画が出来上がる。
 */

const SPEC = readFileSync(join(process.cwd(), "docs", "MANUAL-VIDEO-SPEC.md"), "utf8");
const chapters = parseVideoScript(SPEC);

describe("台本の読み取り", () => {
  it("マニュアルと同じ章数を読み取る（片方だけ増えたら落ちる）", () => {
    expect(chapters).toHaveLength(MANUAL_CHAPTERS.length);
    expect(chapters.map((c) => c.slug)).toEqual(MANUAL_CHAPTERS.map((_, i) => `ch${i + 1}`));
  });

  it("どの章にも場面があり、ナレーションと秒が埋まっている", () => {
    for (const chapter of chapters) {
      expect(chapter.scenes.length).toBeGreaterThan(0);
      for (const scene of chapter.scenes) {
        expect(scene.narration.length).toBeGreaterThan(0);
        expect(scene.screen.length).toBeGreaterThan(0);
        expect(scene.seconds).toBeGreaterThan(0);
      }
    }
  });

  it("場面の番号は1から連番（表の行が抜けたら落ちる）", () => {
    for (const chapter of chapters) {
      expect(chapter.scenes.map((s) => s.index)).toEqual(chapter.scenes.map((_, i) => i + 1));
    }
  });

  it("見出しに書いた場面数と、表の行数が一致する", () => {
    for (const chapter of chapters) {
      const declared = /（[^）]*?(\d+)場面/.exec(chapter.title.replace(/\s/g, ""));
      // 見出しに場面数を書いていない章は素通り（書いてあれば必ず一致させる）
      if (declared) expect(chapter.scenes).toHaveLength(Number(declared[1]));
    }
  });

  it("列が壊れている表は黙って飛ばさず例外にする", () => {
    const broken = [
      "## 5. 台本",
      "### ① 試し ── `ch1.mp4`",
      "| # | 映す画面 | 操作 | ナレーション | 秒 |",
      "|---|---|---|---|---|",
      "| 1 | 画面 | 操作 | 読み上げ | あとで |",
    ].join("\n");
    expect(() => parseVideoScript(broken)).toThrow();
  });
});

describe("字幕（WebVTT）の下書き", () => {
  it("WEBVTT で始まり、場面の数だけ字幕が並ぶ", () => {
    const vtt = buildVtt(chapters[0]);
    expect(vtt.startsWith("WEBVTT\n")).toBe(true);
    expect(vtt.match(/-->/g)).toHaveLength(chapters[0].scenes.length);
    for (const scene of chapters[0].scenes) {
      expect(vtt).toContain(scene.narration);
    }
  });

  it("時刻は重ならずに前へ進み、最後は章の合計秒になる", () => {
    for (const chapter of chapters) {
      const times = [...buildVtt(chapter).matchAll(/(\d\d):(\d\d):(\d\d)\.(\d{3}) --> /g)].map(
        (m) => Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]),
      );
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
      const last = /(\d\d):(\d\d):(\d\d)\.\d{3}\s*$/m;
      const ends = [...buildVtt(chapter).matchAll(/--> (\d\d):(\d\d):(\d\d)\.\d{3}/g)];
      const end = ends[ends.length - 1];
      expect(Number(end[1]) * 3600 + Number(end[2]) * 60 + Number(end[3])).toBe(
        totalSeconds(chapter),
      );
      expect(last.test(`${end[1]}:${end[2]}:${end[3]}.000`)).toBe(true);
    }
  });
});
