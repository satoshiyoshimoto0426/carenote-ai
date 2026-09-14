import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildManualHtml } from "./buildHtml";
import { MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES, type ManualChapter } from "./content";

/**
 * マニュアルの3形態がズレないための番人（検品 2026-09-12 の指摘・§2.7-D 再発防止）。
 *
 * ここで止めたい事故:
 *  ①録画していない動画を印刷版が「あります」と書く（status を見ずに案内文を出していた）
 *  ②同じ文の手順・質問が章内に重なり、React の key 重複で画面から消える
 *  ③本文に < > & " が来て生成HTMLが壊れる
 *  ④画面が指すファイル（印刷版・PDF）が実在しない
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const sample = (over: Partial<ManualChapter> = {}): ManualChapter => ({
  id: "chX",
  no: "①",
  title: "見出し",
  short: "短い名前",
  lead: "この章の説明。",
  video: { src: "/manual/videos/chX.mp4", minutes: 3, status: "planned" },
  steps: [{ text: "ボタンを押します。", uiLabel: "送る" }],
  callouts: [{ kind: "info", text: "知っておくこと。" }],
  faq: [{ q: "質問は？", a: "答えです。" }],
  ...over,
});

describe("印刷版の動画案内は video.status に従う", () => {
  it("未収録（planned）の章は「準備中」と書き、「あります」とは書かない", () => {
    const html = buildManualHtml([sample()], MANUAL_META, MANUAL_PROMISES);
    expect(html).toContain("準備中です");
    expect(html).not.toContain("操作動画があります");
  });

  it("収録済み（ready）の章だけ「あります」と書く", () => {
    const html = buildManualHtml(
      [sample({ video: { src: "/manual/videos/chX.mp4", minutes: 3, status: "ready" } })],
      MANUAL_META,
      MANUAL_PROMISES,
    );
    expect(html).toContain("操作動画があります");
    expect(html).not.toContain("準備中です");
  });

  it("いま配布している印刷版は、全章が未収録なので「あります」を含まない", () => {
    const html = buildManualHtml(MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES);
    const readyCount = MANUAL_CHAPTERS.filter((c) => c.video.status === "ready").length;
    expect(html.match(/操作動画があります/g) ?? []).toHaveLength(readyCount);
    expect(html.match(/準備中です/g) ?? []).toHaveLength(MANUAL_CHAPTERS.length - readyCount);
  });
});

describe("本文データの形（画面が取りこぼさない前提）", () => {
  it("章 id は ch+数字で重複しない", () => {
    const ids = MANUAL_CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^ch\d+$/);
  });

  it("章の中で手順・注意・質問の文が重複しない（React の key に使うため）", () => {
    for (const ch of MANUAL_CHAPTERS) {
      const steps = ch.steps.map((s) => s.text);
      const callouts = ch.callouts.map((c) => c.text);
      const faq = ch.faq.map((f) => f.q);
      expect(new Set(steps).size, `${ch.id} の手順`).toBe(steps.length);
      expect(new Set(callouts).size, `${ch.id} の注意`).toBe(callouts.length);
      expect(new Set(faq).size, `${ch.id} の質問`).toBe(faq.length);
    }
  });

  it("動画の置き場所は章 id と対応している", () => {
    for (const ch of MANUAL_CHAPTERS) {
      expect(ch.video.src).toBe(`/manual/videos/${ch.id}.mp4`);
      expect(ch.video.minutes).toBeGreaterThan(0);
    }
  });

  it("注意の種類は info / warn / tip のいずれか（画面の配色が決まっているもの）", () => {
    for (const ch of MANUAL_CHAPTERS) {
      for (const c of ch.callouts) expect(["info", "warn", "tip"]).toContain(c.kind);
    }
  });
});

describe("生成HTMLの安全性と完全性", () => {
  it("本文の特殊文字をそのまま埋め込まない（HTMLが壊れない）", () => {
    const html = buildManualHtml(
      [sample({ title: '<script>alert("x")</script> & 見出し' })],
      MANUAL_META,
      MANUAL_PROMISES,
    );
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; 見出し");
  });

  it("全章・全手順・全質問が抜けずに出る", () => {
    const html = buildManualHtml(MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES);
    const steps = MANUAL_CHAPTERS.reduce((n, c) => n + c.steps.length, 0);
    const faq = MANUAL_CHAPTERS.reduce((n, c) => n + c.faq.length, 0);
    expect(html.match(/<section id="ch\d+">/g) ?? []).toHaveLength(MANUAL_CHAPTERS.length);
    expect(html.match(/<div class="faq">/g) ?? []).toHaveLength(faq);
    // 手順の li は「約束」「目次」の li と混ざるので、章の ol の中だけ数える
    const inOl = (html.match(/<ol>[\s\S]*?<\/ol>/g) ?? []).join("");
    expect(inOl.match(/<li>/g) ?? []).toHaveLength(steps);
  });

  it("検索避けを入れる（ログイン無しで読めるため）", () => {
    expect(buildManualHtml(MANUAL_CHAPTERS, MANUAL_META, MANUAL_PROMISES)).toContain(
      '<meta name="robots" content="noindex,nofollow">',
    );
  });
});

describe("画面から参照するファイルが実在する", () => {
  it("印刷版HTMLと配布PDFが public にある", () => {
    expect(existsSync(join(ROOT, "public", "manual", "index.html"))).toBe(true);
    expect(existsSync(join(ROOT, "public", "manual", "CareNote-AI-操作マニュアル.pdf"))).toBe(true);
  });

  it("収録済みにした章は、動画ファイルが実在する", () => {
    for (const ch of MANUAL_CHAPTERS.filter((c) => c.video.status === "ready")) {
      expect(existsSync(join(ROOT, "public", ch.video.src.replace(/^\//, ""))), ch.id).toBe(true);
    }
  });
});
