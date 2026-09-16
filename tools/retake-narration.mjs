#!/usr/bin/env node
/**
 * 読み間違いが残った場面だけ、**何度か読み直させて一番良い録り音を採る**。
 *
 * なぜ必要か:
 *   合成音声は同じ文でも毎回わずかに違う読み方をする（2026-09-16 実測。同じ1文が
 *   「主事意見書」と読めた回と「衆議院憲書」と読めた回があった）。つまり読み辞書を入れても
 *   1回作って終わりでは運任せになる。そこで**駄目だった場面だけ録り直し、
 *   文字起こしが台本に一番近い回を残す**。人が何テイクか録って良いものを使うのと同じ考え方。
 *
 * 何と繋がるか:
 *   入力 = <作業フォルダ>/reading-check.json（tools/check-reading.mjs が出す）
 *   出力 = <作業フォルダ>/<章>/audio/sNN.mp3 を良くなったときだけ上書き
 *   声と読み = tools/make-narration.mjs と同じ設定（lib/manual/readingDict.ts）
 *
 * 使い方: node tools/retake-narration.mjs <作業フォルダ> [録り直す回数(既定4)]
 *   ※ 先に tools/check-reading.mjs を回しておくこと
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { READING_DICT, toReadingTone } from "../lib/manual/readingDict.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2];
const TAKES = Number(process.argv[3] ?? 4);
if (!OUT) {
  console.error("使い方: node tools/retake-narration.mjs <作業フォルダ> [録り直す回数]");
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

const VOICE = {
  voice_id: env.MINIMAX_VOICE_ID ?? "Japanese_SeriousCommander",
  speed: 1.0,
  vol: 1,
  pitch: 0,
};
const TONE = toReadingTone();

const normalize = (s) => (s ?? "").replace(/[、。・「」\s]/g, "");

/** 文字の並びの近さ（1.0 が一致）。どの回が台本に近いかを比べるためだけに使う。 */
function similarity(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (x === y) return 1;
  if (!x.length || !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return 1 - prev[y.length] / Math.max(x.length, y.length);
}

async function speak(text) {
  const res = await fetch("https://api.minimax.io/v1/t2a_v2", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${env.MINIMAX_API_KEY}` },
    body: JSON.stringify({
      model: "speech-2.6-hd",
      text,
      language_boost: "Japanese",
      pronunciation_dict: { tone: TONE },
      voice_setting: VOICE,
      audio_setting: { sample_rate: 44100, format: "mp3", bitrate: 128000, channel: 1 },
    }),
  });
  const json = await res.json();
  if (json.base_resp?.status_code !== 0) throw new Error(JSON.stringify(json.base_resp));
  return Buffer.from(json.data.audio, "hex");
}

async function listen(buffer, id) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/mpeg" }), `${id}.mp3`);
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  return JSON.parse(await res.text()).text?.trim() ?? "";
}

const check = JSON.parse(readFileSync(join(OUT, "reading-check.json"), "utf8"));
const targets = check.results.filter((r) => !r.error && normalize(r.heard) !== normalize(r.text));

console.log(
  `読み辞書 ${READING_DICT.length}語 / 録り直す場面 ${targets.length} / 1場面あたり最大${TAKES}回\n`,
);

const report = [];
for (const t of targets) {
  const [slug, n] = t.id.split("-");
  const file = join(OUT, slug, "audio", `s${n}.mp3`);
  let best = { score: similarity(t.text, t.heard), heard: t.heard, buffer: null };
  const first = best.score;
  for (let take = 1; take <= TAKES && best.score < 1; take++) {
    let buffer;
    let heard;
    try {
      buffer = await speak(t.text);
      heard = await listen(buffer, t.id);
    } catch (e) {
      console.log(`  ${t.id} ${take}回目で失敗: ${String(e).slice(0, 80)}`);
      continue;
    }
    const score = similarity(t.text, heard);
    if (score > best.score) best = { score, heard, buffer };
  }
  if (best.buffer) writeFileSync(file, best.buffer);
  report.push({ id: t.id, before: first, after: best.score, heard: best.heard, text: t.text });
  console.log(
    `${t.id} ${first.toFixed(2)} → ${best.score.toFixed(2)}${best.buffer ? " 差し替え" : " 据え置き"}`,
  );
  console.log(`  台本  : ${t.text}`);
  console.log(`  聞こえた: ${best.heard}`);
}

writeFileSync(join(OUT, "retake-report.json"), JSON.stringify(report, null, 2), "utf8");
const improved = report.filter((r) => r.after > r.before).length;
const perfect = report.filter((r) => r.after === 1).length;
console.log(
  `\n良くなった ${improved}場面 / 完全一致 ${perfect}場面 / 据え置き ${report.length - improved}場面`,
);
console.log("※ 据え置きは「同じ音の漢字違い」で元から問題ないことが多い（氏名→使命 など）");
