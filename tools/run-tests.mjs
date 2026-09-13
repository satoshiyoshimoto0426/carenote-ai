#!/usr/bin/env node
/**
 * テストを走らせ、「全部のテストファイルが実際に走ったか」まで確かめる（Quality Gates のセンサー）。
 *
 * なぜ存在するか（2026-09-13 実測）:
 *   vitest はワーカーの起動に失敗したテストファイルを1つ落としても、
 *   `Test Files 7 passed (7)` ＋ `Errors 1 error` と表示したうえで**終了コード 0 を返す**。
 *   つまり「緑だから全部通った」が成り立たない。実際に extension/src/adapters/kaipoke.dom.test.ts
 *   （jsdom 環境の起動に 55 秒かかる）が、並列実行のときだけ黙って落ちていた。
 *   CI もローカルも、それに気づかないまま合格と判定していた。
 *
 * ここでやること:
 *   ① vitest を普通に走らせる
 *   ② ディスク上の *.test.ts の数と、vitest が「走った」と報告した数を突き合わせる
 *   ③ 数が合わない／`Errors` が出ている／vitest 自体が失敗した場合は、非ゼロで終わる
 *
 * 使い方: npm test（package.json の test スクリプトがこれを呼ぶ）。引数はそのまま vitest へ渡す。
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

/** ディスク上のテストファイルを数える（vitest.config.ts の include: **\/*.test.ts と同じ条件）。 */
function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...findTestFiles(full));
    } else if (entry.name.endsWith(".test.ts")) {
      out.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

const args = process.argv.slice(2);
const onDisk = findTestFiles(ROOT);

const run = spawnSync("npx", ["vitest", "run", ...args], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
});
const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
process.stdout.write(output);

if (run.status !== 0) {
  console.error(`\n[run-tests] vitest が失敗しました（終了コード ${run.status}）`);
  process.exit(run.status ?? 1);
}

// 引数でファイルを絞って走らせたときは、全件との突き合わせをしない
if (args.length > 0) process.exit(0);

const errorLine = /^\s*Errors\s+\d+\s+error/m.exec(output);
if (errorLine) {
  console.error(
    `\n[run-tests] vitest が「${errorLine[0].trim()}」と報告しています。` +
      "テストファイルが走らずに落とされた可能性があります（終了コードは 0 でも失敗扱いにします）。",
  );
  process.exit(1);
}

const reported = /^\s*Test Files\s+(\d+)\s+passed\s+\((\d+)\)/m.exec(output);
if (!reported) {
  console.error("\n[run-tests] vitest の集計行（Test Files …）を読み取れませんでした。");
  process.exit(1);
}
const ran = Number(reported[2]);
if (ran !== onDisk.length) {
  console.error(
    `\n[run-tests] 走ったテストファイルは ${ran} 件ですが、ディスクには ${onDisk.length} 件あります。` +
      "\n走らなかったファイルがある＝その範囲は無検査のまま緑になっています。",
  );
  process.exit(1);
}
console.log(`\n[run-tests] テストファイル ${ran} 件すべてが実際に走りました。`);
