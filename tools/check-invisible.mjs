#!/usr/bin/env node
/**
 * ソースに「見えない文字」が混ざっていないかを検査するセンサー（Quality Gate ②）。
 *
 * なぜ存在するか:
 *   独立審査 2026-09-11 critical #1 ── lib/privacy/vault.ts に生の NUL（0x00）が2か所入り、git が同ファイルを
 *   バイナリ扱いして差分が PR / claude-triage に一切届かなかった。ゼロ幅文字（U+200B〜200D・U+FEFF）も
 *   同じく目に見えず、レビューと文字列比較をすり抜ける。grep -P は Windows のロケールで動かないため node で書く。
 *
 * 使い方: node tools/check-invisible.mjs [dir ...]   （既定: app components lib extension tests docs）
 * 見つかれば 1 で終了し、ファイルと位置を出す。CI（quality-gates.yml）と Stop フックの両方から呼ぶ。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".json", ".yml", ".sh"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "coverage", ".git"]);
const roots = process.argv.slice(2);
const targets =
  roots.length > 0 ? roots : ["app", "components", "lib", "extension", "tests", "docs"];

/** 見つけたい文字: NUL・ゼロ幅スペース／非接合子／接合子・BOM（先頭以外） */
const ZW = String.fromCharCode(0x200b, 0x2d, 0x200d); // ゼロ幅スペース〜接合子の範囲
const INVISIBLE = new RegExp(
  `[${String.fromCharCode(0)}${ZW}]|(?<!^)${String.fromCharCode(0xfeff)}`,
  "u",
);

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (EXTS.has(extname(name))) yield p;
  }
}

let bad = 0;
for (const root of targets) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const m = INVISIBLE.exec(line);
      if (m) {
        const code = m[0].codePointAt(0).toString(16).padStart(4, "0");
        console.error(`${file}:${i + 1}: invisible character U+${code.toUpperCase()}`);
        bad++;
      }
    });
  }
}
if (bad > 0) {
  console.error(
    `\n見えない文字が ${bad} 行にあります（NUL・ゼロ幅）。エスケープ表記（"\\u200b" 等）に直してください。`,
  );
  process.exit(1);
}
