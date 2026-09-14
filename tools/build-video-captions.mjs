#!/usr/bin/env node
/**
 * 動画台本（docs/MANUAL-VIDEO-SPEC.md §5）から字幕の下書きを書き出す CLI。
 *
 * 中身の組み立ては lib/manual/videoScript.ts（純粋関数・テスト対象）。ここはファイルに書くだけ。
 *
 * 使い方:
 *   npm run captions   … docs/manual-video/chN.draft.vtt を7本作る
 *
 * 出来たものは**下書き**。時刻は台本の目安の秒数を足しただけなので、収録した映像に合わせて
 * ずらしてから public/manual/videos/chN.vtt として納品すること（docs/MANUAL-VIDEO-SPEC.md §4）。
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildVtt, parseVideoScript, totalSeconds } from "../lib/manual/videoScript.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = join(ROOT, "docs", "MANUAL-VIDEO-SPEC.md");
const OUT_DIR = join(ROOT, "docs", "manual-video");

const chapters = parseVideoScript(readFileSync(SPEC, "utf8"));
if (chapters.length === 0) {
  console.error(`台本の章を見つけられませんでした: ${SPEC}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
let grand = 0;
for (const chapter of chapters) {
  const path = join(OUT_DIR, `${chapter.slug}.draft.vtt`);
  writeFileSync(path, buildVtt(chapter), "utf8");
  const sec = totalSeconds(chapter);
  grand += sec;
  console.log(`wrote ${path} (${chapter.scenes.length}場面 / ${sec}秒)`);
}
console.log(`合計 ${chapters.length}章 / ${grand}秒（約${Math.round(grand / 60)}分）`);
