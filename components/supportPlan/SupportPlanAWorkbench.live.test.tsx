// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_PLAN_A_CHAPTERS } from "@/lib/supportPlan/format";
import { sampleDraft } from "@/lib/supportPlan/testFixtures";
import { isShown, shownText } from "@/tests/helpers/markup";
import SupportPlanAWorkbench from "./SupportPlanAWorkbench";

/**
 * 就労A型の単独の画面（段階2）を**実際に動かして**、入力 → 面談を終える → 送る前の確認 → 作成 → 様式の表示まで通す。
 * 偽物にするのは通信（fetch）だけ。黒塗りの確認画面（PreSendPreview）・様式の組み立ては本物を使う。
 * 決定①「面談を終えてから1回で作る」を、AI を呼ぶ入口（/api/generate）が確認の後に1回だけ呼ばれることで見張る。
 * 利用者はすべて架空（K-014）。
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const flush = async () => {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

/** React が拾う形で入力欄の値を変える（value を直接入れるだけでは onChange が呼ばれない） */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

const button = (root: HTMLElement, text: string) => {
  const b = [...root.querySelectorAll("button")].find((x) => x.textContent?.includes(text));
  if (!b) throw new Error(`ボタン「${text}」が無い`);
  return b as HTMLButtonElement;
};

let container: HTMLDivElement;
let root: Root;
let calls: { url: string; body: Record<string, unknown> }[];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      calls.push({ url, body });
      const json =
        url === "/api/preview"
          ? {
              fields: { clientInfo: body.clientInfo, interviewNotes: body.interviewNotes },
              findings: { names: 0, patterns: [] },
              candidates: {},
            }
          : sampleDraft();
      return new Response(JSON.stringify(json), { status: 200 });
    }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function fillAndFinish(code = "K-014") {
  await act(async () => root.render(<SupportPlanAWorkbench />));
  typeInto(container.querySelector<HTMLInputElement>("#sp-code") as HTMLInputElement, code);
  typeInto(container.querySelector<HTMLInputElement>("#sp-age") as HTMLInputElement, "28歳");
  typeInto(
    container.querySelector<HTMLTextAreaElement>("#sp-notes") as HTMLTextAreaElement,
    "仕事は検品を続けたいです。体調は朝が悪いです。",
  );
  await flush();
}

const consentBox = () =>
  [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find((el) =>
    el.closest("label")?.textContent?.includes("同意を得た"),
  ) as HTMLInputElement;

describe("就労A型の単独の画面", () => {
  it("同意のチェックが無ければ、確認にも AI にも進まない", async () => {
    await fillAndFinish();
    await act(async () => button(container, "面談を終える").click());
    await flush();
    expect(calls).toEqual([]);
    expect(shownText(container, container.querySelector('[role="alert"]'))).toContain("同意");
  });

  it("利用者コードに氏名を入れたら止める（ID化の原則）", async () => {
    await fillAndFinish("山田太郎");
    await act(async () => consentBox().click());
    await act(async () => button(container, "面談を終える").click());
    await flush();
    expect(calls).toEqual([]);
    expect(shownText(container, container.querySelector('[role="alert"]'))).toContain("氏名");
  });

  it("面談を終える → 確認 → 送る で、AI は確認の後に1回だけ呼ばれ、様式どおりの原案が出る", async () => {
    await fillAndFinish();
    // 話に出たかの目安は、端末の中だけで変わる（通信していない）
    expect(container.textContent).toContain("話に出たかの目安 2/9");
    expect(calls).toEqual([]);

    await act(async () => consentBox().click());
    await act(async () => button(container, "面談を終える").click());
    await flush();
    expect(calls.map((c) => c.url)).toEqual(["/api/preview"]);
    expect(calls[0].body).toEqual({
      documentType: "supportPlanA",
      clientInfo: "年齢: 28歳\n契約形態: 雇用契約（A型）",
      interviewNotes: "仕事は検品を続けたいです。体調は朝が悪いです。",
    });
    expect(container.textContent).toContain("面談の文字起こし・メモ");

    await act(async () => button(container, "この内容でAIに送る").click());
    await flush();
    expect(calls.map((c) => c.url)).toEqual(["/api/preview", "/api/generate"]);
    expect(calls[1].body).toEqual(calls[0].body);

    const frame = container.querySelector("iframe");
    expect(isShown(container, frame)).toBe(true);
    // 外から読む Paged.js が画面のログイン情報に触れないよう、同じ出どころの扱いを付けない
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts allow-modals");
    const doc = frame?.getAttribute("srcdoc") ?? "";
    for (const ch of SUPPORT_PLAN_A_CHAPTERS) expect(doc).toContain(ch);
    expect(doc).toContain("K-014");
    // 要確認事項は画面にも出す
    expect(container.textContent).toContain(sampleDraft().itemsToConfirm[0]);
  });
});
