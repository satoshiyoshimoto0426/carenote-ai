#!/usr/bin/env node
/**
 * 個別支援計画書（就労A型）の操作動画に、ナレーション（MiniMax の声）と字幕を重ねて1本の mp4 にする。
 *
 * なぜあるか: 2026-10-03 にクラウド環境で画面を録画した（無音）が、そこからは MiniMax に届かなかった。
 *   声は吉本さんのパソコンで作り、この道具で録画に重ねる（撮り直しは要らない）。
 *
 * 何と繋がるか:
 *   録画   = docs/specs/support-plan-a/video/silent.mp4（無音・字幕なし・1280x720）
 *   区切り = docs/specs/support-plan-a/video/scenes.json（場面ごとの始まりの秒）
 *   台本   = docs/specs/support-plan-a/VIDEO-SCRIPT.md（字幕の文）
 *   声     = <作業フォルダ>/spa1/audio/sNN.mp3（tools/make-narration.mjs の --script で作る）
 *   出力   = <作業フォルダ>/spa1/spa1-dubbed.mp4 と spa1.vtt
 *
 * 決まり:
 *   - 場面の長さは「録画の長さ」と「声の長さ＋前後の間」の長い方。声の方が長い場面は、
 *     その場面の最後のコマを止めて延ばす（読み終わる前に画面が変わらないように ── MANUAL-VIDEO-SPEC.md §7）。
 *   - 字幕は焼き込み（本体マニュアルと同じ）。日本語は空白が無く字幕の道具が自動で折り返さないので、
 *     句読点の位置で2行に分ける（2026-10-03 に1行のまま画面からはみ出した）。
 *   - 冒頭4秒は題名の画面（無音）。
 *
 * 使い方: node tools/dub-support-plan-video.mjs <作業フォルダ> [--font=<書体名>]
 *   書体の既定は Yu Gothic UI（Windows の本体マニュアルと同じ）。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVideoScript } from "../lib/manual/videoScript.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2);
const FONT = ARGS.find((a) => a.startsWith("--font="))?.slice("--font=".length) ?? "Yu Gothic UI";
const [WORK] = ARGS.filter((a) => !a.startsWith("--"));
if (!WORK) {
  console.error("使い方: node tools/dub-support-plan-video.mjs <作業フォルダ> [--font=<書体名>]");
  process.exit(1);
}

const VIDEO_DIR = join(ROOT, "docs", "specs", "support-plan-a", "video");
const SILENT = join(VIDEO_DIR, "silent.mp4");
const timing = JSON.parse(readFileSync(join(VIDEO_DIR, "scenes.json"), "utf8"));
const chapter = parseVideoScript(
  readFileSync(join(ROOT, "docs", "specs", "support-plan-a", "VIDEO-SCRIPT.md"), "utf8"),
).find((c) => c.slug === "spa1");
if (!chapter) throw new Error("台本に spa1 がありません");
if (chapter.scenes.length !== timing.scenes.length) {
  throw new Error(
    `台本の場面数（${chapter.scenes.length}）と録画の区切り（${timing.scenes.length}）が合いません`,
  );
}

const OUT = join(WORK, "spa1");
const AUDIO = join(OUT, "audio");
const TMP = join(OUT, "dub-tmp");
mkdirSync(TMP, { recursive: true });

const INTRO = 4;
const LEAD = 0.3; // 場面が変わってから話し始めるまで
const TAIL = 0.6; // 話し終えてから次の場面まで

const ff = (args, cwd) =>
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { cwd });
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

/** 句読点の位置で2行に分ける（両方の行が max 以下になる所のうち、長さが近い所） */
function wrap(text, max = 34) {
  if (text.length <= max) return [text];
  let best = null;
  for (let i = 0; i < text.length - 1; i++) {
    if (!"、。".includes(text[i])) continue;
    const a = text.slice(0, i + 1);
    const b = text.slice(i + 1);
    if (a.length > max || b.length > max) continue;
    const score = Math.abs(a.length - b.length);
    if (!best || score < best.score) best = { score, lines: [a, b] };
  }
  return best ? best.lines : [text.slice(0, max), text.slice(max)];
}

const assTime = (t) => {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
};
const vttTime = (t) => {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `00:${String(m).padStart(2, "0")}:${s}`;
};

// 1. 冒頭の題名の画面（無音・4秒）。文字は後で字幕と一緒に焼く
ff(
  [
    "-f",
    "lavfi",
    "-i",
    `color=c=0x1b3a5c:s=1280x720:d=${INTRO}:r=30`,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    String(INTRO),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "intro.mp4",
  ],
  TMP,
);

// 2. 場面ごとに、録画の区間＋声を1本にする（声の方が長ければ最後のコマを止めて延ばす）
const parts = ["intro.mp4"];
const cues = [];
let at = INTRO;
timing.scenes.forEach((sc, i) => {
  const n = String(sc.index).padStart(2, "0");
  const voice = join(AUDIO, `s${n}.mp3`);
  if (!existsSync(voice)) {
    throw new Error(
      `声がありません: ${voice}\n先に node tools/make-narration.mjs ${WORK} spa1 --script=docs/specs/support-plan-a/VIDEO-SCRIPT.md を実行してください`,
    );
  }
  const next = i + 1 < timing.scenes.length ? timing.scenes[i + 1].start : timing.end;
  const clip = next - sc.start;
  const spoken = durationOf(voice);
  const length = Math.max(clip, LEAD + spoken + TAIL);
  const pad = Math.max(0, length - clip);
  const delay = Math.round(LEAD * 1000);
  ff(
    [
      "-ss",
      sc.start.toFixed(3),
      "-t",
      clip.toFixed(3),
      "-i",
      SILENT,
      "-i",
      voice,
      "-filter_complex",
      `[0:v]tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},fps=30,format=yuv420p[v];` +
        `[1:a]adelay=${delay}|${delay},apad,atrim=0:${length.toFixed(3)},aresample=48000,` +
        "aformat=channel_layouts=stereo[a]",
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-t",
      length.toFixed(3),
      "-c:v",
      "libx264",
      "-crf",
      "20",
      "-c:a",
      "aac",
      `s${n}.mp4`,
    ],
    TMP,
  );
  parts.push(`s${n}.mp4`);
  cues.push({
    index: sc.index,
    start: at + 0.2,
    end: at + length - 0.15,
    lines: wrap(chapter.scenes[i].narration),
  });
  console.log(
    `場面${sc.index}: 録画 ${clip.toFixed(1)}秒 / 声 ${spoken.toFixed(1)}秒 → ${length.toFixed(1)}秒${pad > 0 ? `（${pad.toFixed(1)}秒延ばした）` : ""}`,
  );
  at += length;
});

// 3. つなぐ
writeFileSync(join(TMP, "list.txt"), parts.map((p) => `file '${p}'`).join("\n"), "utf8");
ff(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "joined.mp4"], TMP);

// 4. 題名と字幕を焼き込む（作業フォルダで動かす ── Windows のドライブ名の「:」をフィルタに書かないため）
const style = (name, size, align, marginV) =>
  `Style: ${name},${FONT},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,0,0,100,100,0,0,` +
  `${name === "Sub" ? 3 : 1},${name === "Sub" ? 14 : 0},0,${align},120,120,${marginV},1`;
const ass = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: 1280",
  "PlayResY: 720",
  "WrapStyle: 2",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  style("Sub", 32, 2, 28),
  style("Title", 56, 5, 0),
  style("Kicker", 30, 5, 0),
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  `Dialogue: 0,${assTime(0)},${assTime(INTRO)},Kicker,,0,0,0,,{\\pos(640,245)}就労継続支援A型`,
  `Dialogue: 0,${assTime(0)},${assTime(INTRO)},Title,,0,0,0,,{\\pos(640,320)}個別支援計画書（原案）をつくる`,
  `Dialogue: 0,${assTime(0)},${assTime(INTRO)},Kicker,,0,0,0,,{\\pos(640,405)}操作のながれ`,
  ...cues.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Sub,,0,0,0,,${c.lines.join("\\N")}`,
  ),
].join("\n");
writeFileSync(join(TMP, "spa1.ass"), ass, "utf8");
ff(
  [
    "-i",
    "joined.mp4",
    "-vf",
    "subtitles=spa1.ass",
    "-c:v",
    "libx264",
    "-crf",
    "20",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    "../spa1-dubbed.mp4",
  ],
  TMP,
);

const vtt = ["WEBVTT", ""];
for (const c of cues)
  vtt.push(`spa1-${c.index}`, `${vttTime(c.start)} --> ${vttTime(c.end)}`, ...c.lines, "");
writeFileSync(join(OUT, "spa1.vtt"), vtt.join("\n"), "utf8");

console.log(`\n出来ました: ${join(OUT, "spa1-dubbed.mp4")}（${at.toFixed(1)}秒）`);
console.log(`作業用のファイルは ${TMP} にあります（消してかまいません）`);
