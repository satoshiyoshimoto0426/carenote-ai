// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLIENT_LIST_ERROR_HEADLINE } from "@/lib/clients/listError";
import { attrOf, elementsOf, type MarkupElement, textOf } from "@/tests/helpers/markup";

/**
 * 利用者一覧（GET /api/clients）を読めないとき、一覧を使う画面が**黙らない**ことを実際に動かして確かめる
 * （2026-09-23 作り直し計画 U0 と検収の指摘）。
 *
 * なぜ必要か:
 *   以前は一覧を読めないと、文字起こしの保存（SaveTranscriptBar）は選択肢が黙って空になり、
 *   救済モードの保存は「新しい利用者として保存」だけが残って**同じ方を二重に登録**できた。
 *   /clients は「まだ利用者がいません」と出していた。どれも失敗を空の一覧に見せる壊れ方。
 *
 * 偽物にするのは通信（fetch）と、保存パネルと関係のない帳票の表示部品だけ。画面そのものは本物を動かす。
 * 文字は tests/helpers/markup.ts の textOf で読む（隠した要素の文字を「出ている」と数えない）。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える。伝えないと act のたびに
// 「環境が act に対応していない」という警告がログを埋め、本物の警告（act の外での更新）が埋もれる
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 救済モードの結果に並ぶ帳票の表示。ここで見るのは保存パネルだけなので、中身は描かない
vi.mock("@/components/drafts/AssessmentDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/CarePlanDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/MeetingSummaryDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/MonitoringDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/SupportLogDraftView", () => ({ default: () => null }));

/** 溜まっている非同期処理を出し切る（偽の通信の応答を act の中で受け取る） */
const flush = async () => {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 一覧 API の DB 失敗（app/api/clients/route.ts の 500）と同じ形 */
const listFailed = () =>
  json(
    {
      error:
        "利用者一覧を読めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。",
    },
    500,
  );

const CLIENT_A = {
  id: "c1",
  orgId: null,
  code: "A",
  attributes: {},
  createdBy: "u1",
  createdAt: "2026-09-01",
  updatedAt: "2026-09-01",
};

/** 呼ばれた通信の記録（"GET /api/clients" の形） */
let calls: string[] = [];
/** GET /api/clients に順番に返す応答（最後の1つは何度でも返す） */
let listResponses: (() => Response)[] = [];

function installFetch() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url === "/api/clients" && method === "GET") {
        const next = listResponses.length > 1 ? listResponses.shift() : listResponses[0];
        if (!next) throw new Error("一覧の応答が用意されていません");
        return next();
      }
      if (url === "/api/clients" && method === "POST") return json({ ...CLIENT_A, id: "new" }, 201);
      if (url === "/api/documents" && method === "POST") return json({ id: "d1" }, 201);
      if (url === "/api/rescue" && method === "POST") {
        return json({
          assessment: {},
          carePlan: {},
          meetingSummary: {},
          supportLog: {},
          monitoring: {},
        });
      }
      throw new Error(`想定外の通信: ${method} ${url}`);
    }),
  );
}

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  installFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

/** いま描かれている画面を木として読み、いちばん外側の要素を返す */
function screen(): MarkupElement {
  const [top] = elementsOf(`<div>${container.innerHTML}</div>`);
  return top;
}

/** 画面に出ている文字（隠した要素の文字は数えない） */
const visibleText = () => textOf(screen());

function buttonByText(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`「${label}」のボタンが見つかりません`);
  return found;
}

async function render(node: ReactNode) {
  root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  await flush();
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("文字起こしの保存（SaveTranscriptBar）", () => {
  async function renderBar() {
    const { default: SaveTranscriptBar } = await import("@/components/create/SaveTranscriptBar");
    await render(
      <SaveTranscriptBar text="会議の記録" kind="meeting" inputClass="" secondaryClass="" />,
    );
  }

  it("一覧 API が 500 なら「利用者一覧を読めませんでした」を画面の文字で出す", async () => {
    listResponses = [listFailed];
    await renderBar();
    expect(visibleText()).toContain(CLIENT_LIST_ERROR_HEADLINE);
    expect(visibleText()).toContain("いまは記録として残せません");
    // 知らせは読み上げにも届く形（role="alert"）で出す
    const alert = elementsOf(container.innerHTML).find((e) => attrOf(e, "role") === "alert");
    expect(alert && textOf(alert)).toContain(CLIENT_LIST_ERROR_HEADLINE);
    // 保存先は選べない（選択肢は「保存先の利用者を選ぶ」だけ）ので、保存も押せない
    expect(container.querySelectorAll("select option")).toHaveLength(1);
    expect(buttonByText("記録として残す").disabled).toBe(true);
  });

  it("読めたときは知らせを出さず、利用者を選べる（上の検査が空振りしていない証拠）", async () => {
    listResponses = [() => json([CLIENT_A])];
    await renderBar();
    expect(visibleText()).not.toContain(CLIENT_LIST_ERROR_HEADLINE);
    const options = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options).toContain("A様");
  });

  it("「一覧をもう一度読む」で読み直し、読めたら知らせが消えて選べるようになる", async () => {
    listResponses = [listFailed, () => json([CLIENT_A])];
    await renderBar();
    expect(visibleText()).toContain(CLIENT_LIST_ERROR_HEADLINE);
    await click(buttonByText("一覧をもう一度読む"));
    expect(visibleText()).not.toContain(CLIENT_LIST_ERROR_HEADLINE);
    expect(calls.filter((c) => c === "GET /api/clients")).toHaveLength(2);
    const options = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options).toContain("A様");
  });
});

describe("救済モードの保存パネル（/rescue）", () => {
  /** 人物像を1つ書いて一式を作り、結果（保存パネル）が出るところまで進める */
  async function renderResult() {
    const { default: RescuePage } = await import("@/app/(dashboard)/rescue/page");
    await render(<RescuePage />);
    const field = container.querySelector<HTMLTextAreaElement>("#f-personality");
    if (!field) throw new Error("人物像の欄が見つかりません");
    // React が入力を拾えるよう、ブラウザと同じ手順で値を入れて input を起こす
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    await act(async () => {
      setValue?.call(field, "穏やかな方");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("書類一式を生成する"));
    if (!container.querySelector("#save-client")) throw new Error("保存パネルが出ていません");
  }

  const saveButton = () => buttonByText("この利用者に5帳票を保存");

  it("一覧 API が 500 なら知らせを出し、「新しい利用者として保存」を止める（二重登録を防ぐ）", async () => {
    listResponses = [listFailed];
    await renderResult();
    expect(visibleText()).toContain(CLIENT_LIST_ERROR_HEADLINE);
    expect(visibleText()).toContain("「新しい利用者として保存」を止めています");
    expect(saveButton().disabled).toBe(true);
    expect(container.querySelector<HTMLSelectElement>("#save-client")?.disabled).toBe(true);
    // 新しい利用者の氏名欄も出さない（押せない保存のために実名を書かせない）
    expect(container.querySelector("#new-client-name")).toBeNull();
    await click(saveButton());
    expect(calls.filter((c) => c.startsWith("POST /api/clients"))).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith("POST /api/documents"))).toHaveLength(0);
  });

  it("読めたときは新しい利用者として保存できる（上の検査が空振りしていない証拠）", async () => {
    listResponses = [() => json([CLIENT_A])];
    await renderResult();
    expect(visibleText()).not.toContain(CLIENT_LIST_ERROR_HEADLINE);
    expect(saveButton().disabled).toBe(false);
    expect(container.querySelector("#new-client-name")).not.toBeNull();
    await click(saveButton());
    expect(calls.filter((c) => c === "POST /api/clients")).toHaveLength(1);
    expect(calls.filter((c) => c === "POST /api/documents")).toHaveLength(5);
    expect(visibleText()).toContain("利用者に保存しました");
  });

  it("「一覧をもう一度読む」で読めたら、保存できるようになる", async () => {
    listResponses = [listFailed, () => json([CLIENT_A])];
    await renderResult();
    expect(saveButton().disabled).toBe(true);
    await click(buttonByText("一覧をもう一度読む"));
    expect(visibleText()).not.toContain(CLIENT_LIST_ERROR_HEADLINE);
    expect(saveButton().disabled).toBe(false);
    const options = [...container.querySelectorAll("#save-client option")].map(
      (o) => o.textContent,
    );
    expect(options).toContain("A様");
  });
});

describe("利用者の一覧（/clients）", () => {
  async function renderList() {
    const { default: ClientsPage } = await import("@/app/(dashboard)/clients/page");
    await render(<ClientsPage />);
  }

  it("一覧 API が 500 なら知らせを出し、「まだ利用者がいません」は出さない", async () => {
    listResponses = [listFailed];
    await renderList();
    expect(visibleText()).toContain(CLIENT_LIST_ERROR_HEADLINE);
    // 隠して出しても「出ていない」と取り違えないよう、HTML 全体で見る
    expect(container.innerHTML).not.toContain("まだ利用者がいません");
  });

  it("0人で読めたときは「まだ利用者がいません」を出す（失敗とは区別する）", async () => {
    listResponses = [() => json([])];
    await renderList();
    expect(visibleText()).toContain("まだ利用者がいません");
    expect(visibleText()).not.toContain(CLIENT_LIST_ERROR_HEADLINE);
  });
});
