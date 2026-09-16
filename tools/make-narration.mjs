#!/usr/bin/env node
/**
 * 台本（docs/MANUAL-VIDEO-SPEC.md §5）のナレーション文を、日本語の音声にする。
 *
 * 何と繋がるか:
 *   入力 = docs/MANUAL-VIDEO-SPEC.md（lib/manual/videoScript.ts が読む）
 *   出力 = <出力先>/<章>/audio/sNN.mp3 ── tools/make-video.mjs が画面と合わせて1本にする
 *   声   = MiniMax の音声合成（.env.local の MINIMAX_API_KEY）
 *
 * すでにある音声は作り直さない（台本を直した章だけ --force で撮り直す）。
 * 使い方: node tools/make-narration.mjs <出力先> [章のslug…] [--force]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVideoScript } from "../lib/manual/videoScript.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const rest = args.filter((a) => a !== "--force");
const OUT = rest[0];
const only = rest.slice(1);
if (!OUT) {
  console.error("使い方: node tools/make-narration.mjs <出力先> [章のslug…] [--force]");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf("=")),
      l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""),
    ]),
);
const KEY = env.MINIMAX_API_KEY;
if (!KEY) {
  console.error(".env.local に MINIMAX_API_KEY がありません");
  process.exit(1);
}

/** 声の設定。介護現場で聞くので、標準よりわずかに遅くする。 */
const VOICE = { voice_id: "Japanese_Whisper_Belle", speed: 0.95, vol: 1, pitch: 0 };

const chapters = parseVideoScript(readFileSync(join(ROOT, "docs", "MANUAL-VIDEO-SPEC.md"), "utf8"));
const targets = only.length ? chapters.filter((c) => only.includes(c.slug)) : chapters;

let made = 0;
let skipped = 0;
let chars = 0;

for (const ch of targets) {
  const dir = join(OUT, ch.slug, "audio");
  mkdirSync(dir, { recursive: true });
  console.log(`\n${ch.title}（${ch.scenes.length}場面）`);
  for (const sc of ch.scenes) {
    const f = join(dir, `s${String(sc.index).padStart(2, "0")}.mp3`);
    if (existsSync(f) && !force) {
      skipped++;
      continue;
    }
    const r = await fetch("https://api.minimax.io/v1/t2a_v2", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: "speech-2.6-hd",
        text: sc.narration,
        voice_setting: VOICE,
        audio_setting: { sample_rate: 44100, format: "mp3", bitrate: 128000, channel: 1 },
      }),
    });
    const j = await r.json();
    if (j.base_resp?.status_code !== 0) {
      console.error(`  場面${sc.index} 失敗:`, JSON.stringify(j.base_resp));
      process.exit(1);
    }
    writeFileSync(f, Buffer.from(j.data.audio, "hex"));
    made++;
    chars += j.extra_info?.usage_characters ?? sc.narration.length;
    process.stdout.write(`  ${sc.index}`);
  }
  console.log("");
}

console.log(`\n新規 ${made}本 / 既存 ${skipped}本 / 使った文字数 ${chars}`);
