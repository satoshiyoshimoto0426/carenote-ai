#!/usr/bin/env node
/**
 * マニュアル動画の素材（画面の静止画）を撮る道具。
 *
 * なぜ存在するか:
 *   スクリーンキャスト型のチュートリアル動画（docs/MANUAL-VIDEO-SPEC.md）を作るには、
 *   実際に動いている画面を**ファイルとして**連番で残す必要がある。
 *   人が手で撮ると91場面ぶんの撮り直しが現実的でないので、Chrome を自動で操作する。
 *
 * 何と繋がるか:
 *   出力 = <出力先>/shots/sNN.png（場面番号どおり）
 *   台本 = docs/MANUAL-VIDEO-SPEC.md（lib/manual/videoScript.ts が読む）
 *   音声 = MiniMax の音声合成（別途）→ tools/make-video.mjs で1本に合成する
 *
 * 追加のパッケージは使わない:
 *   Node 22 以降に WebSocket が入っているので、Chrome の DevTools Protocol へ直接つなぐ。
 *   Playwright / Puppeteer を入れると環境が重くなるうえ、CI でも要らないため。
 *
 * ⚠ 収録用アカウントでしか使わないこと。実在の利用者が入った環境では実行しない。
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PORT = 9333;

/** Chrome を専用プロファイルで起動する（普段使いのプロファイルに触れない）。 */
export function launchChrome({ width, height, headless = true }) {
  const profile = join(tmpdir(), `carenote-shoot-${PORT}`);
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=Translate,MediaRouter",
    "about:blank",
  ];
  if (headless) args.unshift("--headless=new");
  const proc = spawn(CHROME, args, { detached: false, stdio: "ignore" });
  return proc;
}

/** 起動直後は接続できないので、開くまで待つ。 */
async function waitForTarget(timeoutMs = 20000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // まだ起動していない
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Chrome の操作口に接続できませんでした");
}

/** CDP の薄いクライアント。send() でコマンドを1つ送り、結果を待つ。 */
export async function connect() {
  const url = await waitForTarget();
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", () => rej(new Error("接続に失敗")), { once: true });
  });
  let id = 0;
  const waiting = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.reject(new Error(`${msg.error.message}`));
    else w.resolve(msg.result);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("DOM.enable");
  return { send, close: () => ws.close() };
}

/** ページの JS を実行して値を返す。 */
export async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? "ページ内でエラー");
  return r.result?.value;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** URL を開いて、描画が落ち着くまで待つ。 */
export async function goto(cdp, url, settleMs = 2500) {
  await cdp.send("Page.navigate", { url });
  await wait(settleMs);
}

/**
 * React の管理下にある入力欄へ値を入れる。
 * value を直接代入しただけでは React が気づかないので、ネイティブの setter を呼んでから
 * input イベントを発火させる（定番の手順）。
 */
export async function fill(cdp, selector, value) {
  const ok = await evaluate(
    cdp,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`,
  );
  if (!ok) throw new Error(`入力欄が見つかりません: ${selector}`);
}

/**
 * 文字で要素を探して押す（ボタンの見た目が変わっても文言で追えるように）。
 *
 * **完全一致を必ず優先する**。部分一致だけで探すと「Continue」が
 * 「Continue with Google」に当たって Google のログインへ飛ぶ（2026-09-16 に実際に踏んだ）。
 */
export async function clickText(cdp, text, tag = "button, a, [role=button]") {
  const ok = await evaluate(
    cdp,
    `(() => {
      const t = ${JSON.stringify(text)};
      const els = [...document.querySelectorAll(${JSON.stringify(tag)})]
        .filter((e) => !e.disabled && e.offsetParent !== null);
      const label = (e) => (e.innerText || e.textContent || "").trim();
      const el = els.find((e) => label(e) === t) ?? els.find((e) => label(e).includes(t));
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.click();
      return true;
    })()`,
  );
  if (!ok) throw new Error(`押せる要素が見つかりません: ${text}`);
}

/** 画面を撮ってファイルに残す。 */
export async function shoot(cdp, path) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(path, Buffer.from(data, "base64"));
  return path;
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
  return p;
}
