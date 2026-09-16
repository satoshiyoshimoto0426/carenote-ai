#!/usr/bin/env node
/**
 * 作った音声が台本どおりに読めているかを、機械の耳で確かめる。
 *
 * なぜ必要か:
 *   合成音声の読み間違いは**耳でしか分からない**。実際 2026-09-16 の収録では
 *   「下書き」が「もとがき」、「主治医意見書」が「しゅうぎいんけんしょ」と読まれていたのに、
 *   長さも件数も正常だったため誰も気づかなかった。そこで出来た音声を文字起こしに掛け直し、
 *   台本の文と突き合わせて、音の違う所を機械に見つけさせる。
 *
 * 読み方の注意:
 *   文字起こしは「氏名」を「使命」と書くことがある。**音が同じものは読み間違いではない**。
 *   この道具は候補を出すだけで、最後の判断は人（または別のAI）が行う。
 *
 * 何と繋がるか:
 *   入力 = <作業フォルダ>/<章>/audio/sNN.mp3（tools/make-narration.mjs が作ったもの）
 *   台本 = docs/MANUAL-VIDEO-SPEC.md（lib/manual/videoScript.ts が読む）
 *   辞書 = lib/manual/readingDict.ts（ここで見つけた読み間違いを直す場所）
 *   鍵   = .env.local の OPENAI_API_KEY（文字起こし。音声は保存されない）
 *
 * 使い方: node tools/check-reading.mjs <作業フォルダ> [章のslug…]
 *   出力: <作業フォルダ>/reading-check.json と、食い違いの一覧（標準出力）
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVideoScript } from "../lib/manual/videoScript.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2];
if (!OUT) {
  console.error("使い方: node tools/check-reading.mjs <作業フォルダ> [章のslug…]");
  process.exit(1);
}
const only = process.argv.slice(3);

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf("=")),
      l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""),
    ]),
);
if (!env.OPENAI_API_KEY) {
  console.error(".env.local に OPENAI_API_KEY がありません");
  process.exit(1);
}

/** 句読点や空白の差は読み間違いではないので、比べる前に落とす。 */
const normalize = (s) => (s ?? "").replace(/[、。・「」\s]/g, "");

const chapters = parseVideoScript(readFileSync(join(ROOT, "docs", "MANUAL-VIDEO-SPEC.md"), "utf8"));
const targets = only.length ? chapters.filter((c) => only.includes(c.slug)) : chapters;

const jobs = [];
for (const ch of targets) {
  for (const sc of ch.scenes) {
    const n = String(sc.index).padStart(2, "0");
    jobs.push({
      id: `${ch.slug}-${n}`,
      file: join(OUT, ch.slug, "audio", `s${n}.mp3`),
      text: sc.narration,
    });
  }
}

/** whisper-1 を使う理由: 聞こえたままに近い。新しい系ほど文章として整えてしまい、読み間違いが消える。 */
async function listen(job) {
  if (!existsSync(job.file)) return { ...job, heard: null, error: "音声がありません" };
  const form = new FormData();
  form.append("file", new Blob([readFileSync(job.file)], { type: "audio/mpeg" }), `${job.id}.mp3`);
  form.append("model", "whisper-1");
  form.append("language", "ja");
  form.append("temperature", "0");
  form.append("response_format", "json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });
  const body = await res.text();
  if (!res.ok) return { ...job, heard: null, error: `${res.status} ${body.slice(0, 120)}` };
  return { ...job, heard: JSON.parse(body).text?.trim() ?? "" };
}

const results = [];
const queue = [...jobs];
let done = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      results.push(await listen(job));
      process.stdout.write(`\r聞き取り ${++done}/${jobs.length}`);
    }
  }),
);
results.sort((a, b) => a.id.localeCompare(b.id));

const failed = results.filter((r) => r.error);
const diffs = results.filter((r) => !r.error && normalize(r.heard) !== normalize(r.text));
writeFileSync(
  join(OUT, "reading-check.json"),
  JSON.stringify({ checked: results.length, diffs: diffs.length, results }, null, 2),
  "utf8",
);

console.log(
  `\n\n${results.length}件を聞き取り / 食い違い ${diffs.length}件 / 聞けなかった ${failed.length}件\n`,
);
for (const d of diffs) {
  console.log(`【${d.id}】`);
  console.log(`  台本  : ${d.text}`);
  console.log(`  聞こえた: ${d.heard}`);
}
for (const f of failed) console.log(`【${f.id}】${f.error}`);
console.log(`\n食い違いは候補です。**音が同じ別漢字（氏名→使命）は読み間違いではありません。**`);
console.log(`本当に音が違うものだけ lib/manual/readingDict.ts に足し、音声を作り直してください。`);
