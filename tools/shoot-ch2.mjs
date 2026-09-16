#!/usr/bin/env node
/**
 * 第②章「ログインと画面の見方」の画面を撮る（13場面）。
 *
 * 台本: docs/MANUAL-VIDEO-SPEC.md §5 の ②章。場面番号と出力ファイル名（sNN.png）が対応する。
 * 使い方: node tools/shoot-ch2.mjs <出力先フォルダ>
 *   収録用アカウントの情報は .env.local の SHOOT_EMAIL / SHOOT_PASSWORD から読む。
 *
 * ⚠ 収録用アカウント専用。実在の利用者が入った環境では実行しない。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

const OUT = process.argv[2];
if (!OUT) {
  console.error("使い方: node tools/shoot-ch2.mjs <出力先フォルダ>");
  process.exit(1);
}
const SHOTS = ensureDir(join(OUT, "shots"));
const BASE = "https://carenote-ai.vercel.app";
const W = 1280;
const H = 720;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [
      l.slice(0, l.indexOf("=")),
      l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, ""),
    ]),
);
const EMAIL = env.SHOOT_EMAIL;
const PASSWORD = env.SHOOT_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error(".env.local に SHOOT_EMAIL と SHOOT_PASSWORD が要ります（収録用アカウント）");
  process.exit(1);
}

const chrome = launchChrome({ width: W, height: H });
let cdp;
const done = [];

try {
  cdp = await connect();
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 2, // 2倍で撮って 1280x720 へ落とすと文字がきれいになる
    mobile: false,
  });

  const take = async (n, note) => {
    const f = join(SHOTS, `s${String(n).padStart(2, "0")}.png`);
    await shoot(cdp, f);
    done.push(n);
    console.log(`  場面${String(n).padStart(2)} 撮影: ${note}`);
  };

  // --- 場面1: ログイン画面 ---
  await goto(cdp, `${BASE}/sign-in`, 4000);
  await take(1, "ログイン画面");

  // --- ログイン（撮らない。Clerk のテスト用アドレスなので確認コードは 424242 固定） ---
  // Clerk はメールとパスワードを同じフォームに出すので、両方入れて1回で送る
  await fill(cdp, 'input[name="identifier"]', EMAIL);
  const hasPw = await evaluate(cdp, `!!document.querySelector('input[name="password"]')`);
  if (hasPw) await fill(cdp, 'input[name="password"]', PASSWORD);
  await clickText(cdp, "Continue");
  await wait(3500);
  // 段階式（メール→次の画面でパスワード）だったときの保険
  const needsPw = await evaluate(cdp, `!!document.querySelector('input[type="password"]')`);
  if (needsPw) {
    await fill(cdp, 'input[type="password"]', PASSWORD);
    await clickText(cdp, "Continue");
    await wait(3500);
  }
  // 新しい端末からのログインは確認コードを聞かれる
  const needsCode = await evaluate(
    cdp,
    `!!document.querySelector('input[name="code"], input[autocomplete="one-time-code"]')`,
  );
  if (needsCode) {
    await fill(cdp, 'input[name="code"], input[autocomplete="one-time-code"]', "424242");
    await wait(4000);
  }
  const signedIn = await evaluate(cdp, `location.pathname !== "/sign-in"`);
  if (!signedIn) throw new Error("ログインできませんでした（画面が /sign-in のままです）");

  // --- 場面2: ログイン直後の画面 ---
  await wait(2000);
  await take(2, "ログイン直後");

  // --- 場面3: 左メニュー ---
  await goto(cdp, `${BASE}/dashboard`, 3000);
  await take(3, "左メニュー");

  // --- 場面4: 利用者の一覧 ---
  await goto(cdp, `${BASE}/clients`, 3000);
  await take(4, "利用者の一覧");

  // --- 場面5: 「新規」を押して入力欄を開く ---
  await clickText(cdp, "新規");
  await wait(1200);
  await take(5, "新しい利用者の入力欄");

  // --- 場面6: 氏名を入れ、暗号化の注意書きを見せる ---
  await fill(cdp, "#c-name", "山田 花子");
  await wait(600);
  await take(6, "氏名と暗号化の注意書き");

  // --- 場面7: 年齢ほかを入れる ---
  for (const [sel, v] of [
    ["#c-age", "85歳"],
    ["#c-gender", "女性"],
    ["#c-care-level", "要介護2"],
    ["#c-household", "独居"],
  ]) {
    const ok = await evaluate(cdp, `!!document.querySelector(${JSON.stringify(sel)})`);
    if (ok) await fill(cdp, sel, v);
  }
  await wait(600);
  await take(7, "年齢・要介護度など");

  // --- 場面8: 一覧（※作成は押さない。テスト環境に行を増やさないため） ---
  await goto(cdp, `${BASE}/clients`, 3000);
  await take(8, "一覧（作成後の状態に相当）");

  // --- 場面9-13: 利用者の画面と関係者名簿 ---
  const href = await evaluate(
    cdp,
    `(() => {
      const a = [...document.querySelectorAll('a[href^="/clients/"]')]
        .find((x) => (x.innerText || "").includes("A様"));
      return a ? a.getAttribute("href") : null;
    })()`,
  );
  if (!href) throw new Error("A様の行が見つかりません");
  await goto(cdp, `${BASE}${href}`, 3500);
  await take(9, "A様の画面（仮名表示中）");
  await take(10, "関係者名簿の説明");

  // 関係者を1件入れて、記号が付き、消えるところまで撮る。
  // 最後に削除するので、収録用データは残らない（場面13がそのまま後片付けになる）。
  const REL = 'input[list="relation-hints"]';
  const NAME = 'input[placeholder^="氏名"]';
  const relOk = await evaluate(cdp, `!!document.querySelector(${JSON.stringify(REL)})`);
  if (relOk) {
    await fill(cdp, REL, "長女");
    await fill(cdp, NAME, "山田 桜");
    await wait(800);
    await take(11, "続柄と氏名を入れたところ");

    await clickText(cdp, "登録");
    await wait(3000);
    await take(12, "登録すると記号が付く");

    await clickText(cdp, "削除");
    await wait(2500);
    // 確認ダイアログが出る作りなら、それも押す
    const stillThere = await evaluate(cdp, `document.body.innerText.includes("山田 桜")`);
    if (stillThere) {
      await clickText(cdp, "削除");
      await wait(2000);
    }
    await take(13, "削除して元に戻ったところ");
  } else {
    console.log("  !! 関係者名簿の入力欄が見つからないため、場面11-13 は未撮影");
  }

  console.log(`\n撮影できた場面: ${done.join(", ")}`);
  const missing = [...Array(13).keys()].map((i) => i + 1).filter((n) => !done.includes(n));
  if (missing.length) console.log(`未撮影: ${missing.join(", ")}`);
} finally {
  try {
    cdp?.close();
  } catch {
    // closeに失敗しても Chrome は落とす
  }
  chrome.kill();
}
