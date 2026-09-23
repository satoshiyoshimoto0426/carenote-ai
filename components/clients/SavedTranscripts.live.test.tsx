// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRANSCRIPT_TABLE_MISSING_MESSAGE } from "@/lib/db/transcripts";
import SavedTranscripts from "./SavedTranscripts";

/**
 * 残した文字起こし（components/clients/SavedTranscripts.tsx）を、画面を実際に動かして確かめる（2026-09-24 A6 ＝ 計画 U4）。
 * 偽物にするのは通信（fetch）と確かめの画面（window.confirm）だけ。
 *
 * なぜ必要か:
 *   - 本文は**黒塗りを通っていない実名そのもの**。一覧では本文を取りに行かず、「読む」を押したときだけ取り寄せる
 *     （画面を開いただけで実名の全文がブラウザに届かないように）。
 *   - 表が未作成（503）のときに欄ごと消すと「残した物は無い」に見える。管理者がやることを名指しした文を出す
 *     （API の検査 tests/api/transcripts.route.test.ts の意図を、画面の側でも守る）。
 *   - 5年の決まりの正直な文「いまは自動で消えません」を消さない（2026-09-18「画面だけが嘘をついていた」の直し）。
 *   - 「消す」は元に戻せないので、確かめてから消す。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SUMMARY = {
  id: "t1",
  clientId: "c1",
  kind: "meeting",
  title: "9月の会議",
  chars: 3214,
  createdAt: "2026-09-17T03:00:00Z",
  retentionUntil: "2031-09-17T03:00:00Z",
};
/** 本文（実名が入ったまま ── 画面では「読む」を押すまで出ない） */
const BODY = "山田 花子さんの長女、山田 春子さんより。来週の訪問をお願いしたい。";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** "GET /api/transcripts?clientId=c1" の形の通信ごとの応答（配列なら1回ごとに先頭から使う） */
let routes: Record<string, (() => Response)[]> = {};
let calls: string[] = [];
let confirmSpy: ReturnType<typeof vi.spyOn>;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/transcripts?clientId=c1": [() => json({ transcripts: [SUMMARY] })],
    "GET /api/transcripts/t1": [() => json({ text: BODY })],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      calls.push(key);
      const queue = routes[key];
      const next = queue && (queue.length > 1 ? queue.shift() : queue[0]);
      if (!next) throw new Error(`想定外の通信: ${key}`);
      return next();
    }),
  );
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  confirmSpy.mockRestore();
  vi.unstubAllGlobals();
});

async function flush() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render() {
  if (!root) root = createRoot(container);
  await act(async () => {
    root?.render(<SavedTranscripts clientId="c1" />);
  });
  await flush();
}

const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("押す物が見つかりません");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("一覧（本文は取りに行かない）", () => {
  it("開いただけでは一覧の問い合わせだけで、本文（実名）は画面にもブラウザにも届かない", async () => {
    await render();
    expect(calls).toEqual(["GET /api/transcripts?clientId=c1"]);
    expect(container.textContent).not.toContain("山田");
    expect(container.querySelector("h3")?.textContent).toBe("残した文字起こし");
    // 行: 日付・種類・見出し・字数（等幅）と「読む」「消す」
    expect(container.textContent).toContain("9月の会議");
    expect(container.querySelector(".client-pane-date")?.textContent).toBe("3,214字");
    expect(buttonByText("読む")).toBeDefined();
    expect(buttonByText("消す")).toBeDefined();
  });

  it("実名が入っている注意と、5年の決まりの正直な文（いまは自動で消えません）を出す", async () => {
    await render();
    expect(container.textContent).toContain("実名が入っているので、画面を人に見せないでください。");
    expect(container.textContent).toContain(
      "保存から5年を過ぎたら消す決まりですが、いまは自動で消えません（管理者がまとめて消します）。",
    );
  });

  it("0件で読めたときは欄を出さない", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [() => json({ transcripts: [] })];
    await render();
    expect(container.innerHTML).toBe("");
  });
});

describe("読む（押したときだけ本文を取り寄せる）", () => {
  it("「読む」で /api/transcripts/{id} を1回だけ問い合わせ、本文を出す。「閉じる」で隠す", async () => {
    await render();
    await click(buttonByText("読む"));
    expect(calls).toEqual(["GET /api/transcripts?clientId=c1", "GET /api/transcripts/t1"]);
    expect(container.textContent).toContain(BODY);
    const close = buttonByText("閉じる");
    expect(close?.getAttribute("aria-expanded")).toBe("true");
    await click(close);
    expect(container.textContent).not.toContain(BODY);
    expect(buttonByText("読む")?.getAttribute("aria-expanded")).toBe("false");
  });

  it("本文を読めなかったら、サーバーの文を出す", async () => {
    routes["GET /api/transcripts/t1"] = [
      () =>
        json({ error: "保存した文字起こしを読めませんでした。管理者に連絡してください。" }, 500),
    ];
    await render();
    await click(buttonByText("読む"));
    expect(container.textContent).toContain(
      "保存した文字起こしを読めませんでした。管理者に連絡してください。",
    );
  });
});

describe("読めなかったとき（欄を消さない）", () => {
  it("表が未作成（503）なら、管理者がやることを名指しした文を role=alert で出す", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [
      () => json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, 503),
    ];
    await render();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(TRANSCRIPT_TABLE_MISSING_MESSAGE);
    expect(container.querySelector("h3")?.textContent).toBe("残した文字起こし");
  });

  it("「もう一度読む」で読み直し、読めたら知らせが消えて一覧が出る", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [
      () => json({ error: TRANSCRIPT_TABLE_MISSING_MESSAGE }, 503),
      () => json({ transcripts: [SUMMARY] }),
    ];
    await render();
    await click(buttonByText("もう一度読む"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toContain("9月の会議");
  });

  it("通信そのものが失敗したら、通信環境を確かめる文を出す", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [
      () => {
        throw new TypeError("Failed to fetch");
      },
    ];
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("通信環境を確かめて");
  });
});

describe("消す（確かめてから）", () => {
  it("確かめの画面で「キャンセル」なら、消す通信をしない", async () => {
    confirmSpy.mockReturnValue(false);
    await render();
    await click(buttonByText("消す"));
    expect(confirmSpy).toHaveBeenCalledWith(
      "この文字起こしを消します。元に戻せません。よろしいですか。",
    );
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false);
    expect(container.textContent).toContain("9月の会議");
  });

  it("確かめて「OK」なら DELETE を送り、一覧を読み直す（0件になったら欄は消える）", async () => {
    routes["DELETE /api/transcripts/t1"] = [() => json({ ok: true })];
    routes["GET /api/transcripts?clientId=c1"] = [
      () => json({ transcripts: [SUMMARY] }),
      () => json({ transcripts: [] }),
    ];
    await render();
    await click(buttonByText("消す"));
    expect(calls).toEqual([
      "GET /api/transcripts?clientId=c1",
      "DELETE /api/transcripts/t1",
      "GET /api/transcripts?clientId=c1",
    ]);
    expect(container.innerHTML).toBe("");
  });

  it("消せなかったら、サーバーの文（消えていません）をそのまま出す", async () => {
    const message =
      "文字起こしを消せませんでした（消えていません）。少し待ってから、もう一度お試しください。";
    routes["DELETE /api/transcripts/t1"] = [() => json({ error: message }, 503)];
    await render();
    await click(buttonByText("消す"));
    expect(container.textContent).toContain(message);
  });
});
