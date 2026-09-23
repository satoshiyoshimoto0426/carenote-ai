import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { attrOf, elementsOf, isReachable, textOf, within } from "@/tests/helpers/markup";

/**
 * 録音パネルの**出るか出ないか**と、**押せるか押せないか**を固定する。
 *
 * なぜ必要か:
 *   ①表示スイッチが効かなくなると、事業所への説明書を改訂する前に録音が現場へ出る
 *     （§2.7-F の出口ゲートを、約束ではなく仕組みで守っている部分）。
 *   ②同意の確認を通らずに録音を始められると、他事業所の職員・主治医・ご家族の声が
 *     伝えないまま外へ出る。
 *   どちらも「動くけれど守れていない」形で壊れるので、描画そのものを見張る。
 */

async function render(flag: string | undefined) {
  vi.resetModules();
  if (flag === undefined) vi.stubEnv("NEXT_PUBLIC_CARENOTE_RECORDING", "");
  else vi.stubEnv("NEXT_PUBLIC_CARENOTE_RECORDING", flag);
  const { default: RecordingPanel } = await import("./RecordingPanel");
  return renderToStaticMarkup(<RecordingPanel onTranscript={() => {}} />);
}

// 最初の1回だけ読み込みに時間がかかる（変換が走る）ので、計測の外で温めておく
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_CARENOTE_RECORDING", "");
  await import("./RecordingPanel");
  vi.unstubAllEnvs();
}, 30000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("録音パネルの表示スイッチ", () => {
  it("既定（未設定）では何も出さない ── 説明書の改訂が済むまで現場に出さない", async () => {
    expect(await render(undefined)).toBe("");
  });

  it("off でも何も出さない", async () => {
    expect(await render("off")).toBe("");
  });

  it("うっかり別の値が入っていても出さない（on のときだけ出す）", async () => {
    expect(await render("true")).toBe("");
    expect(await render("1")).toBe("");
  });

  it("on にすると出る", async () => {
    const html = await render("on");
    expect(html).toContain("この画面で録音する");
  });
});

/** 同意の文（吉本さんの「残すもの」の1つ。言い回しを変えるときはこの検査も一緒に直す）。 */
const CONSENT = "その場にいる全員に、記録を作るために録音することを伝えました";

describe("同意の確認", () => {
  it("伝えたことにチェックが入るまで「録音を始める」は押せない", async () => {
    const html = await render("on");
    // 同意の文は、見る人にも読み上げにも届く文字として、チェックの印と同じ label の中にある。
    // 以前は html 全体の toContain で見ていたため、文の span を sr-only にしても緑だった（2026-09-24 検収）
    const consent = elementsOf(html).filter(
      (el) => el.tagName === "label" && textOf(el).includes(CONSENT),
    );
    expect(consent).toHaveLength(1);
    const boxes = within(
      consent[0],
      (el) => el.tagName === "input" && attrOf(el, "type") === "checkbox" && isReachable(el),
    );
    expect(boxes).toHaveLength(1);
    // 属性として disabled があるかを木で読む。以前の正規表現は、ボタンの class にある
    // Tailwind の「disabled:opacity-50」の文字で満たされ、押せる状態でも緑だった（2026-09-23 計画 F0a）
    const starts = elementsOf(html).filter(
      (el) => el.tagName === "button" && textOf(el) === "録音を始める",
    );
    expect(starts).toHaveLength(1);
    expect(attrOf(starts[0], "disabled")).toBe("");
  });

  it("音声を保存しないことと、一時停止できることを画面に書いてある", async () => {
    const html = await render("on");
    // 画面に届く文字だけで見る。以前は html 全体の toContain で、説明を隠しても緑だった（2026-09-24 検収）
    const [panel] = elementsOf(html);
    const shown = textOf(panel);
    expect(shown).toContain("音声は保存しません");
    expect(shown).toContain("一時停止");
  });
});
