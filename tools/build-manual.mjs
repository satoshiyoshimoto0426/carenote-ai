#!/usr/bin/env node
/**
 * 印刷・PDF配布用マニュアル（public/manual/index.html）を書き出す CLI。
 *
 * 中身の組み立ては lib/manual/buildHtml.ts（純粋関数・テスト対象）。ここはファイルに書くだけ。
 *
 * 使い方:
 *   npm run manual                         … public/manual/index.html を書き出す
 *   PDF は Chrome のヘッドレスで作る（Edge は日本語の出力が壊れるため使わない）:
 *     "C:/Program Files/Google/Chrome/Application/chrome.exe" --headless --disable-gpu
 *       --no-pdf-header-footer
 *       --print-to-pdf="<リポジトリの絶対パス>/public/manual/CareNote-AI-操作マニュアル.pdf"
 *       "file:///<リポジトリの絶対パス>/public/manual/index.html"
 *   ※ --print-to-pdf は**絶対パス**で渡すこと。相対パスだと Chrome が
 *     「Failed to write file ... 指定されたパスが見つかりません」で書けない（2026-09-12 実測）。
 *
 * 注意:
 *   public/manual/index.html は**生成物**。手で直さず、lib/manual/content.ts を直して再生成すること。
 *   ノンブル（ページ番号）は入れていない ── 章の頭出しは目次のリンクと画面側の /guide#chN で足り、
 *   ページ番号を入れると改訂のたびにズレて紙とPDFで食い違うため（検品 2026-09-12 の判断）。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildManualHtml } from "../lib/manual/buildHtml.ts";
import { MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES } from "../lib/manual/content.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "manual", "index.html");

const html = buildManualHtml(MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html, "utf8");
const steps = MANUAL_CHAPTERS.reduce((n, c) => n + c.steps.length, 0);
const faq = MANUAL_CHAPTERS.reduce((n, c) => n + c.faq.length, 0);
console.log(
  `wrote ${OUT} (${MANUAL_CHAPTERS.length}章 / 手順${steps} / よくある質問${faq} / ${Buffer.byteLength(html, "utf8")} bytes)`,
);
