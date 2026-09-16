#!/usr/bin/env node
/**
 * 撮影手順（tools/shoot-plans.mjs）を実行して、場面ごとの静止画を撮る。
 *
 * 使い方: node tools/shoot-run.mjs <出力先> [章のslug…]
 *   例) node tools/shoot-run.mjs D:/video ch1 ch2
 *   章を指定しなければ、手順のある章すべてを順に撮る。
 *
 * 出力: <出力先>/<章>/shots/sNN.png ＋ <出力先>/<章>/skipped.json（撮れなかった場面と理由）
 *
 * ⚠ 収録用アカウント専用。実在の利用者が入った環境では実行しない。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clickText,
  connect,
  ensureDir,
  evaluate,
  fill,
  goto,
  launchChrome,
  shoot,
  wait,
} from "./shoot.mjs";
import { PLANS } from "./shoot-plans.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2];
if (!OUT) {
  console.error("使い方: node tools/shoot-run.mjs <出力先> [章のslug…]");
  process.exit(1);
}
const only = process.argv.slice(3);
const slugs = only.length ? only : Object.keys(PLANS);

const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf("=")),
      l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""),
    ]),
);
const BASE = "https://carenote-ai.vercel.app";
const W = 1280;
const H = 720;

/** ログイン。すでに入っていれば何もしない（Chrome のプロファイルを使い回すため）。 */
async function login(cdp) {
  await goto(cdp, `${BASE}/clients`, 3000);
  if (await evaluate(cdp, `!location.pathname.startsWith("/sign-in")`)) return;
  await goto(cdp, `${BASE}/sign-in`, 4000);
  await fill(cdp, 'input[name="identifier"]', env.SHOOT_EMAIL);
  if (await evaluate(cdp, `!!document.querySelector('input[name="password"]')`)) {
    await fill(cdp, 'input[name="password"]', env.SHOOT_PASSWORD);
  }
  await clickText(cdp, "Continue");
  await wait(3500);
  if (await evaluate(cdp, `!!document.querySelector('input[type="password"]')`)) {
    await fill(cdp, 'input[type="password"]', env.SHOOT_PASSWORD);
    await clickText(cdp, "Continue");
    await wait(3500);
  }
  // Clerk のテスト用アドレスは確認コードが 424242 で固定
  if (
    await evaluate(
      cdp,
      `!!document.querySelector('input[name="code"], input[autocomplete="one-time-code"]')`,
    )
  ) {
    await fill(cdp, 'input[name="code"], input[autocomplete="one-time-code"]', "424242");
    await wait(4500);
  }
  if (!(await evaluate(cdp, `!location.pathname.startsWith("/sign-in")`))) {
    throw new Error("ログインできませんでした");
  }
}

async function runStep(cdp, step, ctx) {
  if (step.login) return login(cdp);
  if (step.go) return goto(cdp, `${BASE}${step.go}`, 2800);
  if (step.wait) return wait(step.wait);
  if (step.click) return clickText(cdp, step.click);
  if (step.clickIncludes) {
    // 文字の一部でボタンを探す（文言が長い・変わりうるボタン向け）
    const ok = await evaluate(
      cdp,
      `(() => {
        const t = ${JSON.stringify(step.clickIncludes)};
        const el = [...document.querySelectorAll("button, a")]
          .filter((e) => !e.disabled && e.offsetParent !== null)
          .find((e) => (e.innerText || "").includes(t));
        if (!el) return false;
        el.scrollIntoView({ block: "center" });
        el.click();
        return true;
      })()`,
    );
    if (!ok) throw new Error(`「${step.clickIncludes}」を含むボタンが見つかりません`);
    return;
  }
  if (step.clickStartsWith) {
    // 「アセスメントの下書きを作る」のように、前半だけ分かっているボタンを押す
    const ok = await evaluate(
      cdp,
      `(() => {
        const t = ${JSON.stringify(step.clickStartsWith)};
        const el = [...document.querySelectorAll("button")]
          .filter((e) => !e.disabled && e.offsetParent !== null)
          .find((e) => (e.innerText || "").trim().startsWith(t));
        if (!el) return false;
        el.click();
        return true;
      })()`,
    );
    if (!ok) throw new Error(`「${step.clickStartsWith}…」で始まるボタンが見つかりません`);
    return;
  }
  if (step.waitFor) {
    // 画面にその文字が出るまで待つ（AIの応答待ちなど、時間が読めないところで使う）
    const until = Date.now() + (step.timeout ?? 60000);
    while (Date.now() < until) {
      const found = await evaluate(
        cdp,
        `document.body.innerText.includes(${JSON.stringify(step.waitFor)})`,
      );
      if (found) return;
      await wait(2000);
    }
    throw new Error(
      `「${step.waitFor}」が出ませんでした（${(step.timeout ?? 60000) / 1000}秒待ちました）`,
    );
  }
  if (step.fill) return fill(cdp, step.fill, step.value);
  if (step.fillAll) {
    for (const [name, value] of Object.entries(step.fillAll)) {
      const sel = `#${name}, [name="${name}"]`;
      if (await evaluate(cdp, `!!document.querySelector(${JSON.stringify(sel)})`)) {
        await fill(cdp, sel, value);
      }
    }
    return;
  }
  if (step.setFile) {
    // ファイル選択のダイアログを開かずに、input へファイルを渡す。
    // OSのダイアログはブラウザの外なので自動では触れない（CDP の DOM.setFileInputFiles を使う）。
    const doc = await cdp.send("DOM.getDocument", { depth: -1 });
    const node = await cdp.send("DOM.querySelector", {
      nodeId: doc.root.nodeId,
      selector: step.setFile,
    });
    if (!node.nodeId) throw new Error(`ファイル欄が見つかりません: ${step.setFile}`);
    const filePath = step.path ?? env[step.pathEnv];
    if (!filePath) throw new Error(`渡すファイルが決まっていません（${step.pathEnv}）`);
    await cdp.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: [filePath] });
    return;
  }
  if (step.selectClient) {
    // 保存先の利用者を選ぶ（select 要素）
    const ok = await evaluate(
      cdp,
      `(() => {
        const t = ${JSON.stringify(step.selectClient)};
        const sel = [...document.querySelectorAll("select")]
          .find((s) => [...s.options].some((o) => (o.text || "").includes(t)));
        if (!sel) return false;
        const opt = [...sel.options].find((o) => (o.text || "").includes(t));
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      })()`,
    );
    if (!ok) throw new Error(`選べる利用者が見つかりません: ${step.selectClient}`);
    return;
  }
  if (step.openClient) {
    const href = await evaluate(
      cdp,
      `(() => {
        const a = [...document.querySelectorAll('a[href^="/clients/"]')]
          .find((x) => (x.innerText || "").includes(${JSON.stringify(step.openClient)}));
        return a ? a.getAttribute("href") : null;
      })()`,
    );
    if (!href) throw new Error(`一覧に ${step.openClient} が見つかりません`);
    return goto(cdp, `${BASE}${href}`, 3200);
  }
  if (step.shoot) {
    const f = join(ctx.shots, `s${String(step.shoot).padStart(2, "0")}.png`);
    await shoot(cdp, f);
    ctx.done.push(step.shoot);
    process.stdout.write(` ${step.shoot}`);
    return;
  }
  if (step.skip) {
    ctx.skipped.push({ scene: step.skip, why: step.why });
    return;
  }
  if (step.optional) {
    for (const s of step.optional) {
      try {
        await runStep(cdp, s, ctx);
      } catch (e) {
        ctx.warnings.push(`任意の手順でつまずきました: ${e.message}`);
        return;
      }
    }
    return;
  }
  throw new Error(`知らない手順: ${JSON.stringify(step)}`);
}

const chrome = launchChrome({ width: W, height: H });
let cdp;
const summary = [];
try {
  cdp = await connect();
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 2,
    mobile: false,
  });

  for (const slug of slugs) {
    const plan = PLANS[slug];
    if (!plan) {
      console.log(`\n${slug}: 手順がありません`);
      continue;
    }
    const ctx = { shots: ensureDir(join(OUT, slug, "shots")), done: [], skipped: [], warnings: [] };
    process.stdout.write(`\n${slug} 撮影:`);
    for (const step of plan) {
      try {
        await runStep(cdp, step, ctx);
      } catch (e) {
        ctx.warnings.push(`${JSON.stringify(step)} → ${e.message}`);
        process.stdout.write(` !`);
      }
    }
    writeFileSync(
      join(OUT, slug, "skipped.json"),
      JSON.stringify({ skipped: ctx.skipped, warnings: ctx.warnings }, null, 2),
      "utf8",
    );
    console.log(
      `\n  撮影 ${ctx.done.length}場面 / 撮れない ${ctx.skipped.length}場面${ctx.warnings.length ? ` / つまずき ${ctx.warnings.length}件` : ""}`,
    );
    for (const w of ctx.warnings) console.log(`    ! ${w}`);
    summary.push({
      slug,
      shot: ctx.done.length,
      skipped: ctx.skipped.length,
      warnings: ctx.warnings.length,
    });
  }
} finally {
  try {
    cdp?.close();
  } catch {
    // 接続を閉じられなくても Chrome は止める
  }
  chrome.kill();
}

console.log("\n=== まとめ ===");
for (const s of summary)
  console.log(`  ${s.slug}: 撮影 ${s.shot} / 撮れない ${s.skipped} / つまずき ${s.warnings}`);
