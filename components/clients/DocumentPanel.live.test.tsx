// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { documentContentToText } from "@/lib/draftText";
import type { CareDocumentRecord } from "@/types/document";
import type { SupportLogDraft } from "@/types/supportLog";
import DocumentPanel from "./DocumentPanel";

/**
 * 保存した書類の承認（G4）の操作（components/clients/DocumentPanel.tsx）を、画面を実際に動かして確かめる
 * （2026-09-24 A6 ＝ 計画 U3a）。偽物にするのは通信（fetch）・クリップボード・書類の中身の表示部品だけ。
 *
 * なぜ必要か（redesign-maps の testsCoupled: この操作には検査が1つも無かった）:
 *   - **下書きはコピーできない**。止めているのは画面だけ（コピーはブラウザの中で起きる）なので、
 *     「コピー」が押せる形に崩れると、未承認の書類がそのままカイポケや外へ出る。
 *   - 「カイポケ用データ」がコピーする文字は JSON.stringify(content, null, 2) そのもの。
 *     カイポケ拡張の「下書きJSONを貼り付けて読み込む」がこの形を読む（拡張との約束）。
 *   - 承認・取消の失敗は画面に出す（黙って「承認済み」に見せない）。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 書類の中身の表示。ここで見るのは承認の操作なので、中身は目印だけにする
vi.mock("@/components/drafts/AssessmentDraftView", () => ({
  default: () => <div data-view="assessment" />,
}));
vi.mock("@/components/drafts/CarePlanDraftView", () => ({
  default: () => <div data-view="carePlan" />,
}));
vi.mock("@/components/drafts/MeetingSummaryDraftView", () => ({
  default: () => <div data-view="meetingSummary" />,
}));
vi.mock("@/components/drafts/MonitoringDraftView", () => ({
  default: () => <div data-view="monitoring" />,
}));
vi.mock("@/components/drafts/SupportLogDraftView", () => ({
  default: () => <div data-view="supportLog" />,
}));

/** 保存した支援経過の中身（記号のまま・入れ子と改行を含む ── JSON の整形がそのまま渡るかを見る） */
const CONTENT: SupportLogDraft = {
  clientName: "B様",
  entries: [
    {
      date: "2026-09-17",
      category: "電話連絡（家族）",
      action: "B様の長女より電話。",
      background: "次回訪問の日程調整のため。",
      factsAndStatements: "「来週なら都合がつきます」\n（長女）",
      judgement: "予定どおり訪問できる。",
      nextAction: "9/24 に訪問する。",
    },
  ],
  appointments: [],
  itemsToConfirm: ["訪問の時刻"],
};

const DRAFT: CareDocumentRecord = {
  id: "d1",
  clientId: "c1",
  orgId: null,
  docType: "supportLog",
  status: "draft",
  content: CONTENT,
  source: "rescue",
  retentionUntil: "2031-09-17",
  approvedAt: null,
  approvedBy: null,
  createdBy: "u1",
  createdAt: "2026-09-17T10:00:00+09:00",
  updatedAt: "2026-09-17T10:00:00+09:00",
};

const APPROVED: CareDocumentRecord = {
  ...DRAFT,
  status: "approved",
  approvedAt: "2026-09-18T09:00:00+09:00",
  approvedBy: "u1",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 呼ばれた通信（"PATCH /api/documents/d1" の形）と、その本文 */
let calls: { call: string; body: unknown }[] = [];
/** PATCH の応答（テストごとに差し替える） */
let patchResponse: () => Response = () => json(APPROVED);
let writeText: ReturnType<typeof vi.fn>;
/** onChange に渡った書類 */
let changed: CareDocumentRecord[] = [];

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  calls = [];
  changed = [];
  patchResponse = () => json(APPROVED);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({
        call: `${method} ${url}`,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (url === "/api/documents/d1" && method === "PATCH") return patchResponse();
      throw new Error(`想定外の通信: ${method} ${url}`);
    }),
  );
  writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 呼ぶ側（利用者の画面）と同じく、onChange で受けた書類で描き直す入れ物ごと描く */
function Host({ initial }: { initial: CareDocumentRecord }) {
  const [doc, setDoc] = useState(initial);
  return (
    <DocumentPanel
      doc={doc}
      onChange={(updated) => {
        changed.push(updated);
        setDoc(updated);
      }}
    />
  );
}

async function render(doc: CareDocumentRecord) {
  if (!root) root = createRoot(container);
  await act(async () => {
    root?.render(<Host initial={doc} />);
  });
  await flush();
}

const buttons = () => [...container.querySelectorAll("button")];
/** 見た目の文字がちょうどその文字のボタン（読み込み中の印などの svg は文字を持たない） */
const buttonByText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
const text = () => container.textContent ?? "";

async function click(el: Element | undefined) {
  if (!el) throw new Error("押す物が見つかりません");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
}

describe("下書き（G4: 承認するまでコピーできない）", () => {
  it("「承認する」が押せ、「コピー」は押せない形で「承認後にコピーできます」が横に出る", async () => {
    await render(DRAFT);
    expect(buttonByText("承認する")?.disabled).toBe(false);
    const copy = buttonByText("コピー");
    expect(copy).toBeDefined();
    expect(copy?.hasAttribute("disabled")).toBe(true);
    expect(text()).toContain("承認後にコピーできます");
    expect(text()).toContain(
      "内容を確認しました。この書類を承認します（承認者と日時が記録されます）",
    );
  });

  it("「カイポケ用データ」と「承認を取り消す」は出さない（承認済みのときだけ置く）", async () => {
    await render(DRAFT);
    expect(buttonByText("カイポケ用データ")).toBeUndefined();
    expect(buttonByText("承認を取り消す")).toBeUndefined();
  });

  it("押せない「コピー」を押しても、クリップボードに何も書かない", async () => {
    await render(DRAFT);
    await click(buttonByText("コピー"));
    expect(writeText).not.toHaveBeenCalled();
  });

  it("「承認する」は PATCH {action:approve} を送り、通ったら承認済みの形に変わる", async () => {
    await render(DRAFT);
    await click(buttonByText("承認する"));
    expect(calls).toEqual([{ call: "PATCH /api/documents/d1", body: { action: "approve" } }]);
    expect(changed).toEqual([APPROVED]);
    expect(buttonByText("承認を取り消す")).toBeDefined();
    expect(buttonByText("コピー")?.hasAttribute("disabled")).toBe(false);
  });

  it("承認が通らなかったら、サーバーの文を出し、下書きのまま（コピーは押せないまま）", async () => {
    patchResponse = () => json({ error: "書類が見つかりません。" }, 404);
    await render(DRAFT);
    await click(buttonByText("承認する"));
    expect(text()).toContain("書類が見つかりません。");
    expect(changed).toEqual([]);
    expect(buttonByText("承認する")).toBeDefined();
    expect(buttonByText("コピー")?.hasAttribute("disabled")).toBe(true);
  });
});

describe("承認済み", () => {
  it("「コピー」「カイポケ用データ」「承認を取り消す」と、承認した日の札が出る", async () => {
    await render(APPROVED);
    expect(buttonByText("コピー")?.hasAttribute("disabled")).toBe(false);
    expect(buttonByText("カイポケ用データ")).toBeDefined();
    expect(buttonByText("承認を取り消す")).toBeDefined();
    expect(buttonByText("承認する")).toBeUndefined();
    expect(text()).toContain("承認済み・");
    expect(text()).toContain("下書きJSONを貼り付けて読み込む");
  });

  it("「コピー」は書類の文字（documentContentToText）をクリップボードへ書く", async () => {
    await render(APPROVED);
    await click(buttonByText("コピー"));
    expect(writeText).toHaveBeenCalledWith(documentContentToText("supportLog", CONTENT));
    expect(text()).toContain("コピーしました");
  });

  it("「カイポケ用データ」は JSON.stringify(content, null, 2) をそのまま書く（拡張との約束）", async () => {
    await render(APPROVED);
    await click(buttonByText("カイポケ用データ"));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toBe(JSON.stringify(CONTENT, null, 2));
  });

  it("「承認を取り消す」は PATCH {action:unapprove} を送り、通ったら下書きに戻る", async () => {
    patchResponse = () => json(DRAFT);
    await render(APPROVED);
    await click(buttonByText("承認を取り消す"));
    expect(calls).toEqual([{ call: "PATCH /api/documents/d1", body: { action: "unapprove" } }]);
    expect(buttonByText("承認する")).toBeDefined();
    expect(buttonByText("コピー")?.hasAttribute("disabled")).toBe(true);
  });

  it("取消が通らなかったら、サーバーの文を出し、承認済みのまま", async () => {
    patchResponse = () => json({ error: "ログインが必要です。" }, 401);
    await render(APPROVED);
    await click(buttonByText("承認を取り消す"));
    expect(text()).toContain("ログインが必要です。");
    expect(buttonByText("カイポケ用データ")).toBeDefined();
  });
});

it("書類の中身は種類に合った表示部品で出す", async () => {
  await render(APPROVED);
  expect(container.querySelector('[data-view="supportLog"]')).not.toBeNull();
});
