#!/usr/bin/env node
/**
 * 「画面を撮れない場面」のための説明カードを作る。
 *
 * なぜ偽の画面を作らないか:
 *   録音アプリやカイポケのような**他社の画面**を生成AIで描くと、実在しない画面を
 *   本物として職員に見せることになる。覚えた操作が実際と違う、という事故に直結するので
 *   絶対にやらない。代わりに「ここは別のアプリです」と**一目で分かる説明カード**にする。
 *   写真や模擬画面ではないので、本物と見間違えようがない。
 *
 * 何と繋がるか:
 *   出力 = <出力先>/shots/sNN.png（撮影した画面と同じ置き場・同じ大きさ）
 *   定義 = tools/shoot-plans.mjs の card 指定、または CARDS（このファイル）
 *   使い方: node tools/make-card.mjs <出力先の親フォルダ>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect, ensureDir, goto, launchChrome, shoot, wait } from "./shoot.mjs";

/** 章ごとの、画面を撮れない場面と、そこに出す説明。 */
export const CARDS = {
  ch4: {
    1: {
      badge: "CareNote の外のアプリ",
      title: "録音アプリで文字にする",
      body: "電話の録音は、まず録音アプリ（SecondBrain）で文字にします。文字起こしの本文を全部選んでコピーし、次の画面で貼り付けます。",
      note: "この操作は CareNote の画面ではありません。録音一覧には通話相手の名前が出るため、画面を人に見せないでください。",
    },
  },
  ch6: {
    5: {
      badge: "パソコンの画面（CareNote の外）",
      title: "資料（PDF）を選ぶ",
      body: "「資料を追加」を押すと、パソコンのファイル選択の窓が開きます。診療情報提供書や主治医意見書などのPDFを選びます。",
      note: "この窓はパソコン側のもので、CareNote の画面ではありません。",
    },
    6: {
      badge: "実際の資料が要る場面",
      title: "資料の読み取り結果",
      body: "選んだ資料をAIが読み、出典つきの要約と「要注意点」を出します。ここは実物の資料がないと映せないため、実際の画面での確認をお願いします。",
      note: "収録には架空の資料が必要です。実在の利用者の書類は使わないでください。",
    },
  },
  ch7: {
    4: {
      badge: "わざと起こせない場面",
      title: "名簿が読めないとき",
      body: "「利用者名簿を読み込めなかったため送信を中止しました」と赤く出ます。名前の置き換えができない状態では、AIへ送らずに必ず止まります。",
      note: "この画面は障害が起きたときだけ出ます。出たら管理者に連絡してください。",
    },
    5: {
      badge: "わざと起こせない場面",
      title: "AIの利用枠が足りないとき",
      body: "AIの利用枠が尽きると、赤いメッセージが出て下書きが作れません。書いたメモは消えないので、枠が戻ってからもう一度押せます。",
      note: "この画面も障害時だけ出ます。管理者が利用枠を足すと直ります。",
    },
    12: {
      badge: "ブラウザの設定画面",
      title: "拡張機能の設定",
      body: "カイポケへの転記に使う拡張機能は、ブラウザの拡張管理画面から読み込み、設定画面にトークンを入れます。",
      note: "この画面はブラウザ側のもので、CareNote の画面ではありません。",
    },
    13: {
      badge: "わざと起こせない場面",
      title: "画面に何も出ないとき",
      body: "画面が真っ白のまま動かないときは、いったん再読み込みしてください。直らなければ、押したボタンと時刻を控えて管理者に伝えてください。",
      note: "メモの内容は消えていないことが多いので、閉じる前に控えておくと安全です。",
    },
  },
};

const html = ({ badge, title, body, note }) => `<!doctype html>
<meta charset="utf-8">
<style>
  @import url("https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap");
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1280px; height: 720px; display: flex; align-items: center; justify-content: center;
    background: #eef1f4; font-family: "Noto Sans JP", "Yu Gothic UI", sans-serif;
    color: #10151a; line-height: 1.85; letter-spacing: .01em;
  }
  .card {
    width: 860px; background: #fff; border: 1px solid #dbe2e8; border-radius: 14px;
    padding: 46px 52px; box-shadow: 0 1px 2px rgba(16,21,26,.05), 0 18px 40px -24px rgba(16,21,26,.3);
  }
  .badge {
    display: inline-block; font-size: 13px; font-weight: 700; color: #9a5b06;
    background: #fdf4e6; border: 1px solid #f0dcbb; border-radius: 999px; padding: 5px 14px;
  }
  h1 { font-size: 34px; font-weight: 700; line-height: 1.4; margin: 20px 0 16px; }
  p.body { font-size: 19px; color: #10151a; }
  p.note {
    margin-top: 24px; padding-top: 18px; border-top: 1px solid #eaeff3;
    font-size: 15px; color: #47535f;
  }
</style>
<div class="card">
  <span class="badge">${badge}</span>
  <h1>${title}</h1>
  <p class="body">${body}</p>
  <p class="note">${note}</p>
</div>`;

const OUT = process.argv[2];
if (!OUT) {
  console.error("使い方: node tools/make-card.mjs <出力先の親フォルダ>");
  process.exit(1);
}

const chrome = launchChrome({ width: 1280, height: 720 });
let cdp;
try {
  cdp = await connect();
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 720,
    deviceScaleFactor: 2,
    mobile: false,
  });
  const tmp = ensureDir(join(OUT, "_cards"));
  for (const [slug, scenes] of Object.entries(CARDS)) {
    const shots = ensureDir(join(OUT, slug, "shots"));
    for (const [n, card] of Object.entries(scenes)) {
      const f = join(tmp, `${slug}-${n}.html`);
      writeFileSync(f, html(card), "utf8");
      await goto(cdp, `file:///${f.replace(/\\/g, "/")}`, 1500);
      await wait(600); // 書体の読み込みを待つ
      await shoot(cdp, join(shots, `s${String(n).padStart(2, "0")}.png`));
      console.log(`  ${slug} 場面${n}: ${card.title}`);
    }
  }
} finally {
  try {
    cdp?.close();
  } catch {
    // 閉じられなくても Chrome は止める
  }
  chrome.kill();
}
console.log("説明カードを作りました");
