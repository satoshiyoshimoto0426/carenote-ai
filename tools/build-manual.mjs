#!/usr/bin/env node
/**
 * 印刷・PDF配布用マニュアル（public/manual/index.html）を生成する。
 *
 * なぜ存在するか:
 *   本文の正本は lib/manual/content.ts の1か所だけにしたい（3か所に書くとズレる）。
 *   アプリ内の使い方ページは同じデータを React で描き、こちらは「1枚もの」の静的HTMLとして書き出す。
 *   静的HTMLにするのは、①ログインしなくても印刷・配布できる ②Chrome で PDF に変換できる の2点のため。
 *
 * 使い方:
 *   npm run manual                         … public/manual/index.html を書き出す
 *   PDF は Chrome のヘッドレスで作る（Edge は日本語の出力が壊れるため使わない）:
 *     "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu  *       --no-pdf-header-footer  *       --print-to-pdf="public/manual/CareNote-AI-操作マニュアル.pdf"  *       "file:///<リポジトリの絶対パス>/public/manual/index.html"
 *
 * 注意:
 *   public/manual/index.html は**生成物**。手で直さず、lib/manual/content.ts を直して再生成すること。
 *   ノンブル（ページ番号）は入れていない ── 章の頭出しは目次のリンクと画面側の /guide#chN で足り、
 *   ページ番号を入れると改訂のたびにズレて紙とPDFで食い違うため（検品 2026-09-12 の判断）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES } from "../lib/manual/content.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "manual", "index.html");

/** HTML に埋め込む前に必ず通す（本文に < > & " が来ても壊れない・混ざらない） */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const CALLOUT_LABEL = { info: "知っておくこと", warn: "気をつけること", tip: "こつ" };

function chapterHtml(ch) {
  const steps = ch.steps
    .map(
      (s) =>
        `      <li>${esc(s.text)}${s.uiLabel ? ` <span class="ui">${esc(s.uiLabel)}</span>` : ""}</li>`,
    )
    .join("\n");
  const callouts = ch.callouts
    .map(
      (c) =>
        `    <div class="callout ${c.kind}"><span class="callout-label">${CALLOUT_LABEL[c.kind]}:</span> ${esc(c.text)}</div>`,
    )
    .join("\n");
  const faq = ch.faq
    .map(
      (f) =>
        `    <div class="faq"><div class="faq-q">${esc(f.q)}</div><div class="faq-a">${esc(f.a)}</div></div>`,
    )
    .join("\n");

  // 動画の案内は status で出し分ける（録画していないものを「ある」と書かない）
  const videoNote =
    ch.video.status === "ready"
      ? `この章には約${esc(String(ch.video.minutes))}分の操作動画があります。CareNote の「使い方」画面（画面左のメニュー）でご覧ください。`
      : `この章の操作動画（約${esc(String(ch.video.minutes))}分）は準備中です。公開までは、下の手順と画面の文字を見ながら操作してください。`;

  return `  <section id="${esc(ch.id)}">
    <h2><span class="no">${esc(ch.no)}</span> ${esc(ch.title)}</h2>
    <p class="lead">${esc(ch.lead)}</p>
    <div class="video-note">${videoNote}</div>
    <h3>手順</h3>
    <ol>
${steps}
    </ol>
${callouts}
    <h3>よくある質問</h3>
${faq}
  </section>`;
}

/**
 * 本文データから印刷用HTMLを組み立てる（副作用なし・テスト対象）。
 * lib/manual/manualHtml.test.ts が「準備中の章を『あります』と書かない」等をここで固定する。
 */
export function buildManualHtml(
  chaptersData = MANUAL_CHAPTERS,
  meta = MANUAL_META,
  promisesData = MANUAL_PROMISES,
) {
  const toc = chaptersData
    .map((ch) => `      <li><a href="#${esc(ch.id)}">${esc(ch.no)} ${esc(ch.short)}</a></li>`)
    .join("\n");

  const promises = promisesData.map((p) => `      <li>${esc(p)}</li>`).join("\n");

  const chapters = chaptersData.map((ch) => chapterHtml(ch)).join("\n\n");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- 事業所内の配布物なので検索結果には出さない（認証は掛けていない・ROADMAP 第4版 P-MANUAL の判断） -->
<meta name="robots" content="noindex,nofollow">
<title>${esc(meta.title)}（印刷用）</title>
<!-- このファイルは tools/build-manual.mjs の生成物です。手で直さず lib/manual/content.ts を直して再生成してください。 -->
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #F7F5F1;
    color: #1C1B19;
    font-family: "Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif;
    line-height: 1.8;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 10;
    display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
    background: #15604D; color: #fff; padding: 12px 20px;
  }
  .toolbar h1 { font-size: 0.95rem; margin: 0; margin-right: auto; font-weight: 600; }
  .toolbar button, .toolbar a {
    border: 1px solid rgba(255,255,255,0.35); background: transparent; color: #fff;
    padding: 8px 14px; border-radius: 8px; font-size: 0.82rem; cursor: pointer;
    text-decoration: none; font-family: inherit;
  }
  .toolbar button:hover, .toolbar a:hover { background: rgba(255,255,255,0.14); }
  .sheet {
    max-width: 820px; margin: 24px auto; background: #fff;
    padding: 44px 52px; box-shadow: 0 1px 4px rgba(28,27,25,0.08);
  }
  h1.doc-title {
    font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
    font-size: 1.75rem; margin: 0 0 6px; font-weight: 500;
  }
  .subtitle { color: #6B6862; font-size: 0.88rem; margin: 0 0 4px; }
  .meta { color: #9A968D; font-size: 0.78rem; margin: 0 0 26px; }
  h2 {
    font-family: "Hiragino Mincho ProN", "Yu Mincho", serif;
    font-size: 1.2rem; font-weight: 500; margin: 34px 0 10px;
    border-left: 4px solid #15604D; padding-left: 11px;
  }
  h2 .no { color: #9A968D; margin-right: 4px; }
  h3 {
    font-size: 0.95rem; font-weight: 600; color: #1C1B19;
    margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #ECE8E1;
  }
  p, li { font-size: 0.9rem; }
  .lead { color: #4A4741; margin: 0 0 12px; }
  ol { padding-left: 22px; }
  ol li { margin-bottom: 7px; }
  .ui {
    display: inline-block; background: #EEF4F1; color: #15604D;
    border: 1px solid #CDE0D8; border-radius: 5px;
    padding: 0 6px; font-size: 0.82em; white-space: nowrap;
  }
  .promises { background: #EEF4F1; border: 1px solid #CDE0D8; border-radius: 10px; padding: 14px 18px; margin: 0 0 22px; }
  .promises h3 { margin-top: 0; border: none; color: #15604D; }
  .promises ul { margin: 0; padding-left: 20px; }
  .toc { border: 1px solid #E7E3DC; border-radius: 10px; padding: 14px 18px; margin: 0 0 26px; }
  .toc h3 { margin-top: 0; border: none; }
  .toc ul { margin: 0; padding-left: 20px; columns: 2; }
  .toc a { color: #15604D; text-decoration: none; }
  .callout {
    border-radius: 10px; padding: 11px 15px; margin: 10px 0; font-size: 0.86rem;
    border: 1px solid; break-inside: avoid;
  }
  .callout-label { font-weight: 700; }
  .callout.info { background: #F4F7FA; border-color: #D5E0E9; color: #27506B; }
  .callout.warn { background: #FDF4F1; border-color: #F0D3C9; color: #8A3A22; }
  .callout.tip  { background: #EEF4F1; border-color: #CDE0D8; color: #15604D; }
  .video-note {
    background: #FBF6EC; border: 1px solid #EADFC6; color: #7A5B17;
    border-radius: 10px; padding: 10px 15px; margin: 10px 0 4px; font-size: 0.84rem;
  }
  .faq { border: 1px solid #E7E3DC; border-radius: 10px; padding: 11px 15px; margin-bottom: 8px; break-inside: avoid; }
  .faq-q { font-weight: 600; font-size: 0.88rem; }
  .faq-a { color: #4A4741; font-size: 0.86rem; margin-top: 3px; }
  section { break-inside: auto; }
  .footer { text-align: center; color: #9A968D; font-size: 0.76rem; margin-top: 38px; }

  @media print {
    .toolbar { display: none; }
    /* callout の種別は背景色で示すので、職員がブラウザから刷るときも色を落とさない */
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { box-shadow: none; margin: 0; padding: 0; max-width: 100%; }
    h2 { break-after: avoid; }
    h3 { break-after: avoid; }
    .faq, .callout { break-inside: avoid; }
    /* ol 全体に avoid を掛けると34手順の章が丸ごと次ページへ送られて大きな空白が出る（検品 2026-09-12）。
       割れてはいけないのは1手順なので li に掛ける */
    ol li { break-inside: avoid; }
    a { color: inherit; text-decoration: none; }
  }
  @page { size: A4; margin: 16mm 14mm; }
</style>
</head>
<body>
  <div class="toolbar">
    <h1>${esc(meta.title)}</h1>
    <a href="/guide">アプリの「使い方」へ戻る（動画つき）</a>
    <button type="button" onclick="window.print()">印刷する / PDFとして保存する</button>
  </div>

  <div class="sheet">
    <h1 class="doc-title">${esc(meta.title)}</h1>
    <p class="subtitle">${esc(meta.subtitle)}</p>
    <p class="meta">${esc(meta.audience)} ／ ${esc(meta.version)}（最終更新 ${esc(meta.updatedAt)}）</p>

    <div class="promises">
      <h3>この道具の3つの約束</h3>
      <ul>
${promises}
      </ul>
    </div>

    <div class="toc">
      <h3>目次</h3>
      <ul>
${toc}
      </ul>
    </div>

${chapters}

    <p class="footer">${esc(meta.title)} ${esc(meta.version)}<br>
    画面が変わったときは、このマニュアルも同時に差し替えます。最新版はアプリの「使い方」画面から入手できます。</p>
  </div>
</body>
</html>
`;
}

/** 直接実行したときだけ書き出す（テストから import しても副作用を出さない） */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const html = buildManualHtml();
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, html, "utf8");
  const steps = MANUAL_CHAPTERS.reduce((n, c) => n + c.steps.length, 0);
  const faq = MANUAL_CHAPTERS.reduce((n, c) => n + c.faq.length, 0);
  console.log(
    `wrote ${OUT} (${MANUAL_CHAPTERS.length}章 / 手順${steps} / よくある質問${faq} / ${Buffer.byteLength(html, "utf8")} bytes)`,
  );
}
