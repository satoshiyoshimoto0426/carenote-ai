// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isShown, shownText } from "@/tests/helpers/markup";
import RelatedPeople from "./RelatedPeople";

/**
 * 関係者名簿（components/clients/RelatedPeople.tsx）を、画面を実際に動かして確かめる（2026-09-24 A6 ＝ 計画 U4）。
 * 偽物にするのは通信（fetch）だけ。
 *
 * なぜ必要か:
 *   - 名簿に無い人の名前は黒塗りで消えない。登録の欄（続柄・氏名・「登録」）と「削除」をアートボード（行だけ）に合わせて
 *     落とすと、家族の名前を置き換える手段が画面から消える。撮影の道具（tools/shoot-plans.mjs）も欄の形を使う。
 *   - 名簿を読めなかったとき、空の名簿に見せると「家族はまだ登録されていない」と取り違え、同じ方を登録し直させる。
 *   - 説明の文は保証できることだけ（計画の指摘 CRITIQUE・U4 ──「実名はこの画面にだけ表示します」とは書かない）。
 *
 * 「出ている」は tests/helpers/markup.ts の shownText・isShown で見る（隠した要素の文字や部品を数えない ──
 * 2026-09-24 に2つの枝を取り込んだときに寄せた。jsdom の textContent は隠した文字も数える）。
 * 「出していない」は textContent のまま（隠して出した文字も拾える）。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PERSON = { id: "r1", clientId: "c1", relation: "長女", name: "佐藤 花子", createdAt: "x" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 通信ごとの応答（配列なら1回ごとに先頭から使い、最後の1つは何度でも使う） */
let routes: Record<string, (() => Response)[]> = {};
let calls: { call: string; body: unknown }[] = [];

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  calls = [];
  routes = { "GET /api/clients/c1/related": [() => json([PERSON])] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      calls.push({ call: key, body: init?.body ? JSON.parse(String(init.body)) : null });
      const queue = routes[key];
      const next = queue && (queue.length > 1 ? queue.shift() : queue[0]);
      if (!next) throw new Error(`想定外の通信: ${key}`);
      return next();
    }),
  );
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
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render() {
  if (!root) root = createRoot(container);
  await act(async () => {
    root?.render(<RelatedPeople clientId="c1" clientCode="B" />);
  });
  await flush();
}

const q = <E extends Element = Element>(selector: string) => container.querySelector<E>(selector);
/** 画面に出ている文字（隠した要素の文字は数えない）。見つからなければ "" */
const shown = (el: Element | null | undefined) => shownText(container, el);
/** 隠されずに出ているか（見つからなければ false） */
const visible = (el: Element | null | undefined) => isShown(container, el);
const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
const relationInput = () => q<HTMLInputElement>('input[list="relation-hints"]');
const nameInput = () => q<HTMLInputElement>('input[placeholder^="氏名"]');

async function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error("欄が見つかりません");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: HTMLElement | undefined) {
  if (!el) throw new Error("押す物が見つかりません");
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("名簿の行と登録の欄", () => {
  it("行は 続柄 | 実名 | → 置き換わる記号 | 削除", async () => {
    await render();
    const row = q("ul > li");
    const cells = [...(row?.children ?? [])].map((el) => shown(el).trim());
    expect(cells).toEqual(["長女", "佐藤 花子", "→ B様の長女", "削除"]);
    // 「削除」は読み上げでどの行のものか分かる（続柄のセルに結ぶ）
    const describedBy = buttonByText("削除")?.getAttribute("aria-describedby") ?? "";
    expect(shown(document.getElementById(describedBy))).toBe("長女");
  });

  it("登録の欄: 続柄の候補（datalist）・氏名の例・名前つきの欄。「登録」は両方入れるまで押せない", async () => {
    await render();
    expect(relationInput()?.getAttribute("placeholder")).toBe("続柄・役割（例: 長女・長男・妻）");
    expect(nameInput()?.getAttribute("placeholder")).toBe("氏名（例: 佐藤 一郎）");
    const hints = [...container.querySelectorAll("datalist#relation-hints option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(hints).toContain("長女");
    expect(hints).toContain("主治医");
    // 欄は label で名前が付いている（placeholder だけにしない）
    const labelled = [...container.querySelectorAll("label")].map((l) => l.htmlFor);
    for (const input of [relationInput(), nameInput()]) {
      expect(visible(input)).toBe(true);
      expect(input?.id).toBeTruthy();
      expect(labelled).toContain(input?.id);
    }
    expect(buttonByText("登録")?.disabled).toBe(true);
    await type(relationInput(), "長男");
    expect(buttonByText("登録")?.disabled).toBe(true);
    await type(nameInput(), "佐藤 一郎");
    expect(buttonByText("登録")?.disabled).toBe(false);
    await type(nameInput(), "   ");
    expect(buttonByText("登録")?.disabled).toBe(true);
  });

  it("「登録」は続柄と氏名を POST し、名簿を読み直す", async () => {
    routes["POST /api/clients/c1/related"] = [() => json({ id: "r2" }, 201)];
    await render();
    await type(relationInput(), "長男");
    await type(nameInput(), "佐藤 一郎");
    await click(buttonByText("登録"));
    expect(calls.map((c) => c.call)).toEqual([
      "GET /api/clients/c1/related",
      "POST /api/clients/c1/related",
      "GET /api/clients/c1/related",
    ]);
    expect(calls[1]?.body).toEqual({ relation: "長男", name: "佐藤 一郎" });
    expect(relationInput()?.value).toBe("");
  });

  it("登録できなかったら、サーバーの文を出す", async () => {
    const message = "「長女」は既に登録されています。続柄を変えてください（例: 長女・次女）。";
    routes["POST /api/clients/c1/related"] = [() => json({ error: message }, 400)];
    await render();
    await type(relationInput(), "長女");
    await type(nameInput(), "佐藤 一郎");
    await click(buttonByText("登録"));
    expect(shown(q('[role="alert"]'))).toBe(message);
  });

  it("「削除」は確かめずにその行を消し（使い方の本文どおり）、消せなかったらサーバーの文を出す", async () => {
    const message = "対象が見つかりません（既に削除済みか、権限がありません）。";
    routes["DELETE /api/clients/c1/related?relatedId=r1"] = [() => json({ error: message }, 404)];
    await render();
    await click(buttonByText("削除"));
    expect(calls.map((c) => c.call)).toContain("DELETE /api/clients/c1/related?relatedId=r1");
    expect(shown(q('[role="alert"]'))).toBe(message);
  });

  it("説明の文は保証できることだけ（この画面にだけ表示、とは書かない）", async () => {
    await render();
    expect(shown(container)).toContain(
      "ここに登録した名前は、AIへ送る前に「B様の長女」のような記号に置き換わります。この名簿の実名はAIには送りません。",
    );
    expect(container.textContent).not.toContain("この画面にだけ");
  });
});

describe("読めなかったとき（空の名簿に見せない）", () => {
  const DOWN =
    "関係者名簿を読み込めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";

  it("一覧が 503 なら、サーバーの文を role=alert で出す", async () => {
    routes["GET /api/clients/c1/related"] = [() => json({ error: DOWN }, 503)];
    await render();
    expect(shown(q('[role="alert"]'))).toContain(DOWN);
  });

  it("「もう一度読む」で読み直し、読めたら知らせが消えて名簿が出る", async () => {
    routes["GET /api/clients/c1/related"] = [
      () => json({ error: DOWN }, 503),
      () => json([PERSON]),
    ];
    await render();
    await click(buttonByText("もう一度読む"));
    expect(q('[role="alert"]')).toBeNull();
    expect(shown(container)).toContain("佐藤 花子");
  });

  it("通信そのものが失敗したら、通信環境を確かめる文を出す", async () => {
    routes["GET /api/clients/c1/related"] = [
      () => {
        throw new TypeError("Failed to fetch");
      },
    ];
    await render();
    expect(shown(q('[role="alert"]'))).toContain("通信環境を確かめて");
  });

  it("0人で読めたときは知らせを出さず、登録の欄は出す", async () => {
    routes["GET /api/clients/c1/related"] = [() => json([])];
    await render();
    expect(q('[role="alert"]')).toBeNull();
    expect(container.textContent).not.toContain("読み込めませんでした");
    expect(visible(relationInput())).toBe(true);
  });
});
