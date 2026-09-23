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
 *   ⓪ 安全テストの一覧 tools/safety-tests.json と照らし、名指しのファイルが揃っているか・
 *      守るフォルダが最低件数を下回っていないか・飛ばす／絞る書き方（.skip( .only( .todo( など）が
 *      無いかを確かめる（判定は tools/testManifest.mjs。vitest より前に見るので数秒で分かる）
 *   ① vitest を普通に走らせる
 *   ② ディスク上の *.test.ts の数と、vitest が「走った」と報告した数を突き合わせる
 *   ③ 数が合わない／`Errors` が出ている／vitest 自体が失敗した場合は、非ゼロで終わる
 *   ④ 集計行（Test Files / Tests）に skipped・todo・expected fail が1件でもあれば非ゼロで終わる
 *      （2026-09-23 追加。安全テストを消しても飛ばしても緑のままだった穴 ── 吉本さん決定）
 *
 * 使い方: npm test（package.json の test スクリプトがこれを呼ぶ）。引数はそのまま vitest へ渡す。
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAllPassed, checkManifest } from "./testManifest.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);

/**
 * ディスク上のテストファイルを数える。
 * **vitest.config.ts の include と必ず同じ条件にすること** ── 片方だけ広いと、
 * 置いたのに走らないテストができ、このセンサーもそれを見逃す（独立審査 2026-09-13）。
 */
function findTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...findTestFiles(full));
    } else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      out.push(relative(ROOT, full).replace(/\\/g, "/"));
    }
  }
  return out;
}

const args = process.argv.slice(2);
const onDisk = findTestFiles(ROOT);

// ⓪ 安全テストの一覧。引数でファイルを絞ったときも必ず見る（消えた安全テストは、絞っても消えたまま）。
const MANIFEST = "tools/safety-tests.json";
let manifest;
try {
  manifest = JSON.parse(readFileSync(join(ROOT, MANIFEST), "utf8"));
} catch (e) {
  console.error(
    `[run-tests] 安全テストの一覧 ${MANIFEST} を読めませんでした（${e instanceof Error ? e.message : String(e)}）。` +
      "\n読めない＝安全テストが揃っているか確かめられないので失敗にします。",
  );
  process.exit(1);
}
const manifestErrors = checkManifest(manifest, onDisk, (rel) =>
  readFileSync(join(ROOT, rel), "utf8"),
);
if (manifestErrors.length > 0) {
  console.error(
    `[run-tests] 安全テストの見張り（${MANIFEST}）に引っかかりました:\n` +
      manifestErrors.map((e) => `  - ${e}`).join("\n") +
      "\n消す・名前を変える・弱めるときは、吉本さんの承認のうえで一覧も同じコミットで直してください。",
  );
  process.exit(1);
}

const run = spawnSync("npx", ["vitest", "run", ...args], {
  cwd: ROOT,
  encoding: "utf8",
  shell: process.platform === "win32",
  // 色を消す。GitHub Actions は CI=true なので vitest（tinyrainbow）が集計行を
  // ESC 列で包み、素の正規表現が当たらなくなる ── 実際に CI だけ赤になった（2026-09-13）。
  env: { ...process.env, NO_COLOR: "1" },
});
const raw = `${run.stdout ?? ""}${run.stderr ?? ""}`;
process.stdout.write(raw);

// NO_COLOR を渡しても、別経路で色が付く可能性に備えて照合前に ESC 列を落とす（二重の備え）。
// 正規表現リテラルに制御文字を直接書かないよう、ESC は文字コードから組み立てる。
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const output = raw.replace(ANSI, "");

if (run.status !== 0) {
  console.error(`\n[run-tests] vitest が失敗しました（終了コード ${run.status}）`);
  process.exit(run.status ?? 1);
}

// 「Errors N error」は、テストファイルが走らずに落とされたのに終了コード 0 で返ってくる状態。
// このスクリプトが存在する当の理由なので、**引数の有無にかかわらず**必ず見る。
const errorLine = /^\s*Errors\s+\d+\s+error/m.exec(output);
if (errorLine) {
  console.error(
    `\n[run-tests] vitest が「${errorLine[0].trim()}」と報告しています。` +
      "テストファイルが走らずに落とされた可能性があります（終了コードは 0 でも失敗扱いにします）。",
  );
  process.exit(1);
}

// 引数で絞って走らせたときは、ここから先（全件との突き合わせ・飛ばしの検査）はしない。
// `-t` で名前を絞ると、外れたテストは skipped と数えられるため（CI と npm test は引数なし）。
if (args.length > 0) process.exit(0);

// ④ 集計行が「全部合格」だけか。skipped・todo は終了コード 0 のまま緑に見えるので、ここで落とす。
const fileSummary = checkAllPassed(output, "Test Files");
const testSummary = checkAllPassed(output, "Tests");
const summaryErrors = [...fileSummary.errors, ...testSummary.errors];
if (summaryErrors.length > 0) {
  console.error(
    `\n[run-tests] 飛ばされた・読めないテストがあります:\n${summaryErrors.map((e) => `  - ${e}`).join("\n")}` +
      "\n飛ばしたテストは何も確かめていないのに緑に見えるので、1件でも失敗にします。",
  );
  process.exit(1);
}
const ran = fileSummary.total;
if (ran !== onDisk.length) {
  console.error(
    `\n[run-tests] 走ったテストファイルは ${ran} 件ですが、ディスクには ${onDisk.length} 件あります。` +
      "\n走らなかったファイルがある＝その範囲は無検査のまま緑になっています。",
  );
  process.exit(1);
}
console.log(
  `\n[run-tests] テストファイル ${ran} 件すべてが実際に走り、飛ばされたテストもありません` +
    `（安全テストの一覧 ${MANIFEST} も確認済み）。`,
);
