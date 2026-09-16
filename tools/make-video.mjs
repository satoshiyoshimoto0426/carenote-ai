#!/usr/bin/env node
/**
 * 画面の静止画（tools/shoot-*.mjs）と、ナレーション音声（MiniMax）を1本の動画にする。
 *
 * なぜこの作りか:
 *   場面ごとの表示時間は**台本の見積もり秒ではなく、実際に出来た音声の長さ**に合わせる。
 *   見積もりで切ると、読み終わる前に画面が変わったり、無音が続いたりする。
 *
 * 何と繋がるか:
 *   入力 = <作業フォルダ>/shots/sNN.png ＋ <作業フォルダ>/audio/sNN.mp3
 *   台本 = docs/MANUAL-VIDEO-SPEC.md（字幕の文はここから）
 *   出力 = <作業フォルダ>/chN.mp4（字幕焼き込み）と chN.vtt（実尺に合わせた字幕）
 *
 * 使い方: node tools/make-video.mjs <作業フォルダ> <章のslug 例 ch2>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVideoScript } from "../lib/manual/videoScript.ts";

const DIR = process.argv[2];
const SLUG = process.argv[3];
if (!DIR || !SLUG) {
  console.error("使い方: node tools/make-video.mjs <作業フォルダ> <章のslug 例 ch2>");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const chapter = parseVideoScript(
  readFileSync(join(ROOT, "docs", "MANUAL-VIDEO-SPEC.md"), "utf8"),
).find((c) => c.slug === SLUG);
if (!chapter) {
  console.error(`台本に ${SLUG} が見つかりません`);
  process.exit(1);
}

const ff = (args) => execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
/** 音声ファイルの実際の長さ（秒）。 */
const durationOf = (file) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      file,
    ])
      .toString()
      .trim(),
  );

const shots = join(DIR, "shots");
const audio = join(DIR, "audio");
const parts = [];
const cues = [];
let at = 0;

console.log(`${chapter.title}`);
for (const scene of chapter.scenes) {
  const n = String(scene.index).padStart(2, "0");
  const png = join(shots, `s${n}.png`);
  const mp3 = join(audio, `s${n}.mp3`);
  if (!existsSync(png) || !existsSync(mp3)) {
    console.log(`  場面${n}: 素材がないので飛ばします`);
    continue;
  }
  // 読み終わってすぐ切り替わると忙しないので、後ろに少し余白を足す
  const pad = 0.7;
  const dur = +(durationOf(mp3) + pad).toFixed(3);
  const out = join(DIR, `part${n}.mp4`);
  ff([
    "-loop",
    "1",
    "-i",
    png,
    "-i",
    mp3,
    "-t",
    String(dur),
    "-vf",
    "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=0xeef1f4,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-r",
    "30",
    "-af",
    "apad",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "44100",
    "-shortest",
    out,
  ]);
  parts.push(out);
  cues.push({ index: scene.index, start: at, end: at + dur, text: scene.narration });
  at += dur;
  console.log(`  場面${n}: ${dur.toFixed(1)}秒`);
}

if (parts.length === 0) {
  console.error("素材が1つもありません");
  process.exit(1);
}

// --- 字幕（実尺に合わせて作り直す） ---
const ts = (s, sep) => {
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(Math.floor(s % 60)).padStart(2, "0");
  const ms = String(Math.round((s - Math.floor(s)) * 1000)).padStart(3, "0");
  return `${h}:${m}:${sec}${sep}${ms}`;
};
writeFileSync(
  join(DIR, `${SLUG}.vtt`),
  `WEBVTT\n\n${cues
    .map((c) => `${SLUG}-${c.index}\n${ts(c.start, ".")} --> ${ts(c.end, ".")}\n${c.text}\n`)
    .join("\n")}`,
  "utf8",
);
const srt = join(DIR, `${SLUG}.srt`);
writeFileSync(
  srt,
  cues.map((c, i) => `${i + 1}\n${ts(c.start, ",")} --> ${ts(c.end, ",")}\n${c.text}\n`).join("\n"),
  "utf8",
);

// --- つなぐ ---
const list = join(DIR, "parts.txt");
writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"), "utf8");
const joined = join(DIR, `${SLUG}-nosub.mp4`);
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);

// --- 字幕を焼き込む（配って見てもらう用。字幕ファイルも別に出してある） ---
const final = join(DIR, `${SLUG}.mp4`);
try {
  ff([
    "-i",
    joined,
    "-vf",
    `subtitles=${SLUG}.srt:force_style='FontName=Yu Gothic UI,FontSize=19,PrimaryColour=&H00FFFFFF,BackColour=&HB0000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=28'`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-c:a",
    "copy",
    final,
  ]);
  console.log(`\n出来上がり: ${final}（字幕は焼き込み済み）`);
} catch {
  console.log(`\n字幕の焼き込みに失敗したので、字幕なしで出します: ${joined}`);
  console.log(`字幕は ${SLUG}.vtt / ${SLUG}.srt を動画と同じ場所に置いて使ってください`);
}

// 途中ファイルの掃除
for (const f of readdirSync(DIR)) {
  if (/^part\d+\.mp4$/.test(f)) execFileSync("cmd", ["/c", "del", "/q", join(DIR, f)]);
}
console.log(`合計 ${at.toFixed(1)}秒 / ${parts.length}場面`);
