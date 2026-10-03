// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_PLAN_A_CHAPTERS } from "@/lib/supportPlan/format";
import { sampleDraft } from "@/lib/supportPlan/testFixtures";
import { TRANSCRIPT_HEADING } from "@/lib/transcribe/appendTranscript";
import { isShown, shownText } from "@/tests/helpers/markup";
import SupportPlanAWorkbench from "./SupportPlanAWorkbench";

/**
 * 就労A型の単独の画面（段階2）を**実際に動かして**、入力 → 面談を終える → 送る前の確認 → 作成 → 様式の表示まで通す。
 * 偽物にするのは通信（fetch）と録音の部品だけ（マイク・MediaRecorder は jsdom に無いので、押すと区切り1つぶんの
 * 文字起こしを渡すボタンに置き換える。録音の部品そのものの試験は components/recording/ にある）。
 * 黒塗りの確認画面（PreSendPreview）・様式の組み立ては本物を使う。
 * 決定①「面談を終えてから1回で作る」を、AI を呼ぶ入口（/api/generate）が確認の後に1回だけ呼ばれることで見張る。
 * 利用者はすべて架空（K-014）。
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

/** 録音の部品の代役: 押すと、区切り1つぶんの文字起こしを画面へ渡す */
const RECORDED_TEXT = "録音から起こした文です。";
vi.mock("@/components/recording/RecordingPanel", async () => {
  const { createElement } = await import("react");
  return {
    RECORDING_ENABLED: true,
    default: ({
      onTranscript,
      disabled = false,
    }: {
      onTranscript: (text: string) => void;
      disabled?: boolean;
    }) =>
      createElement(
        "button",
        { type: "button", id: "fake-rec", disabled, onClick: () => onTranscript(RECORDED_TEXT) },
        "録音の区切りが文字になった",
      ),
  };
});

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
    // 話に出たかの目安は、端末の中だけで変わる（通信していない）。
    // 基本情報（年齢）を入れたので「1. 基本情報」、話から「仕事」「体調」の2つ ＝ 3/10
    expect(container.textContent).toContain("話に出たかの目安 3/10");
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
    // 表紙の呼び名は、空なら「利用者」＋コードの先頭の英字
    expect(doc).toContain("利用者K（K-014）");
    // 録音していない（貼り付け・手書き）ので、出典は「面談の記録」
    expect(doc).toContain("面談の記録（K-014 アセスメント面談）をもとに作成");
    // 右に「要記入」の一覧と、AI からの確認のお願い（原案の itemsToConfirm）を出す
    const pending = container.querySelector("#sp-pending-list");
    expect(shownText(container, pending)).toContain("生年月日");
    expect(shownText(container, pending)).toContain("次回見直し予定日");
    const ask = container.querySelector('[aria-labelledby="sp-ask"]');
    expect(shownText(container, ask)).toContain(sampleDraft().itemsToConfirm[0]);
    // 何も保存しないことを、原案の上で言う
    expect(shownText(container, container.querySelector("#sp-not-saved"))).toContain(
      "この画面は保存しません",
    );
  });
});

describe("録音", () => {
  it("同意の前は録音できず、録音の文字起こしは書いたメモの後ろに見出しを付けて足し、出典は決定④の書き方になる", async () => {
    await fillAndFinish();
    const rec = () => container.querySelector<HTMLButtonElement>("#fake-rec") as HTMLButtonElement;
    expect(rec().disabled).toBe(true);

    await act(async () => consentBox().click());
    expect(rec().disabled).toBe(false);
    await act(async () => rec().click());
    await flush();
    const notes = container.querySelector<HTMLTextAreaElement>("#sp-notes") as HTMLTextAreaElement;
    expect(notes.value).toBe(
      `仕事は検品を続けたいです。体調は朝が悪いです。\n\n${TRANSCRIPT_HEADING}\n${RECORDED_TEXT}`,
    );

    await act(async () => button(container, "面談を終える").click());
    await flush();
    await act(async () => button(container, "この内容でAIに送る").click());
    await flush();
    const doc = container.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
    expect(doc).toContain("面談の録音の文字起こし（K-014 アセスメント面談）をもとに作成");
  });
});

describe("失敗の表示", () => {
  async function finishWith(code = "K-014") {
    await fillAndFinish(code);
    await act(async () => consentBox().click());
    await act(async () => button(container, "面談を終える").click());
    await flush();
  }

  it("サーバーが返した日本語の文（422＝名前が残っていて送れない）をそのまま出し、AI へは進まない", async () => {
    const msg = "実名が残っている可能性があるため、送信を中止しました。";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
        return new Response(JSON.stringify({ error: msg }), { status: 422 });
      }),
    );
    await finishWith();
    expect(calls.map((c) => c.url)).toEqual(["/api/preview"]);
    expect(shownText(container, container.querySelector('[role="alert"]'))).toBe(msg);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("通信そのものが失敗したら、英語ではなく日本語で知らせる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await finishWith();
    const alert = shownText(container, container.querySelector('[role="alert"]'));
    expect(alert).toContain("通信に失敗しました");
    expect(alert).not.toContain("Failed to fetch");
  });
});

describe("入力の決まり", () => {
  it("利用者コードに空白の入った名前（ローマ字）を入れたら止める（英数字とハイフンだけ）", async () => {
    await fillAndFinish("Yamada Taro");
    await act(async () => consentBox().click());
    await act(async () => button(container, "面談を終える").click());
    await flush();
    expect(calls).toEqual([]);
    expect(shownText(container, container.querySelector('[role="alert"]'))).toContain(
      "英数字とハイフン",
    );
  });

  it("氏名・受給者証番号を入れないよう、基本情報の上に注意書きを出す", async () => {
    await fillAndFinish();
    expect(shownText(container, container.querySelector("#sp-no-names"))).toContain(
      "氏名・受給者証番号は入れないでください",
    );
  });
});
