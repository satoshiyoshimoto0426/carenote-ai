// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type CssNode, parseCss } from "@/tests/helpers/cssTokens";
import { shownText } from "@/tests/helpers/markup";
import { ClientsProvider } from "./ClientsContext";
import ClientTable, { ClientSearchField } from "./ClientTable";

/**
 * 利用者の一覧の表（components/clients/ClientTable.tsx）を、本物の一覧の入れ物（ClientsContext）ごと動かして確かめる。
 * 偽物にするのは通信（fetch）と next/link（ただの <a> にする）だけ。
 *
 * なぜ必要か（2026-09-24 A5 ＝ 計画 U1）:
 *   - 行は記号のリンク（/clients/{id}）で開く。撮影の道具（tools/shoot-run.mjs の openClient）と
 *     救済モードの保存後のリンクがこの形を使う。行（<tr>）そのものを押す物にしない。
 *   - 一覧を読めなかったのに「まだ利用者がいません」と出すと、失敗が空の一覧に化ける（計画 U0 と同じ壊れ方）。
 *   - 実名を表に出さない。API の応答に氏名が紛れ込んでも、表は記号・属性・登録日しか描かない。
 *   - まだ利用者がいないときの文は、氏名を暗号化して記号で表示することを約束する文（消さない）。
 *
 * 「出ている」は tests/helpers/markup.ts の shownText で見る（隠した要素の文字を数えない ── 2026-09-24 に2つの枝を
 * 取り込んだときに寄せた。jsdom の textContent は隠した文字も数える）。「出していない」は textContent・innerHTML のまま。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

/** 一覧 API の1件。氏名（name）は本物の API は返さないが、紛れ込んでも表に出ないことを見るために入れておく。 */
const API_ROWS = [
  {
    id: "c1",
    orgId: null,
    code: "A",
    attributes: { age: "85歳", gender: "女性", careLevel: "要介護2", household: "独居" },
    createdBy: "u1",
    createdAt: "2026-09-01T00:00:00+09:00",
    updatedAt: "2026-09-01T00:00:00+09:00",
    name: "山田 花子",
  },
  {
    id: "c2",
    orgId: null,
    code: "B",
    attributes: { age: "91歳", gender: "男性", careLevel: "要介護3", household: "長女と同居" },
    createdBy: "u1",
    createdAt: "2026-08-20T10:00:00+09:00",
    updatedAt: "2026-08-20T10:00:00+09:00",
    name: "佐藤 太郎",
  },
  {
    id: "c3",
    orgId: null,
    code: "F",
    attributes: {},
    createdBy: "u1",
    createdAt: "2026-07-02T09:00:00+09:00",
    updatedAt: "2026-07-02T09:00:00+09:00",
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 呼ばれた通信の記録（"GET /api/clients" の形） */
let calls: string[] = [];
/** GET /api/clients に順番に返す応答（最後の1つは何度でも返す） */
let listResponses: (() => Response | Promise<Response>)[] = [];

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  calls = [];
  listResponses = [() => json(API_ROWS)];
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
      throw new Error(`想定外の通信: ${method} ${url}`);
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

/** 溜まっている非同期処理を出し切る（偽の通信の応答を act の中で受け取る） */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 一覧の入れ物の中に、探す欄と表を描く（ClientsLayout と同じ組み合わせ・上の帯は無し）。 */
async function render(selectedId: string | null = null) {
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ClientsProvider>
        <ClientSearchField />
        <ClientTable selectedId={selectedId} />
      </ClientsProvider>,
    );
  });
  await flush();
}

/** 画面に出ている文字（隠した要素の文字は数えない ── tests/helpers/markup.ts）。見つからなければ "" */
const shown = (el: Element | null | undefined) => shownText(container, el);
const rows = () => [...container.querySelectorAll("tbody tr")];
const rowCodes = () => rows().map((tr) => shown(tr.querySelector("th")));
/** 画面の文字をすべて（隠した要素の文字も）。「出していない」を確かめるときに使う */
const text = () => container.textContent ?? "";
/** 画面に出ている文字の全体。「出ている」を確かめるときに使う */
const shownAll = () => shownText(container, container);

/** React が拾えるよう、ブラウザと同じ手順で探す欄に言葉を入れる */
async function search(word: string) {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="記号・属性で探す"]');
  if (!input) throw new Error("探す欄が見つかりません");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, word);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function buttonByText(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`「${label}」のボタンが見つかりません`);
  return found;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
  await flush();
}

describe("一覧の表（読めたとき）", () => {
  it("列は 記号・属性・登録日", async () => {
    await render();
    const heads = [...container.querySelectorAll('thead th[scope="col"]')].map((th) => shown(th));
    expect(heads).toEqual(["記号", "属性", "登録日"]);
  });

  it("各行は、行の見出しのセルの中の記号のリンク（/clients/{id}）で開く。行に押せる物はそれ1つだけ", async () => {
    await render();
    expect(rows()).toHaveLength(3);
    for (const tr of rows()) {
      const link = tr.querySelector<HTMLAnchorElement>('th[scope="row"] > a[href^="/clients/"]');
      expect(link).not.toBeNull();
      // 行の中で押せる物（リンク・ボタン・Tab で止まる物）は記号のリンクだけ。行そのものも押す物にしない
      // （querySelectorAll は子孫しか見ないので、行の要素自身の tabindex / role も見る）
      expect(tr.querySelectorAll("a, button, [tabindex], [role='button']")).toHaveLength(1);
      expect(tr.hasAttribute("tabindex")).toBe(false);
      expect(tr.hasAttribute("role")).toBe(false);
    }
    const links = rows().map((tr) => tr.querySelector("a"));
    expect(links.map((a) => a?.getAttribute("href"))).toEqual([
      "/clients/c1",
      "/clients/c2",
      "/clients/c3",
    ]);
    expect(links.map((a) => shown(a))).toEqual(["A様", "B様", "F様"]);
  });

  it("属性は「・」区切りの1行、無ければ「（属性未設定）」。登録日は日本時間の年月日", async () => {
    await render();
    const cells = rows().map((tr) => [...tr.querySelectorAll("td")].map((td) => shown(td)));
    expect(cells).toEqual([
      ["85歳・女性・要介護2・独居", "2026/09/01"],
      ["91歳・男性・要介護3・長女と同居", "2026/08/20"],
      ["（属性未設定）", "2026/07/02"],
    ]);
  });

  it("API の応答に氏名が紛れ込んでも、表には出さない（属性の中にも HTML の中にも無い）", async () => {
    await render();
    for (const name of ["山田", "花子", "佐藤", "太郎"]) {
      expect(container.innerHTML).not.toContain(name);
    }
  });

  it("表の上に、氏名を記号で表示する約束の1行を見える形で出す（利用者がいるときも消さない）", async () => {
    // 以前の一覧の見出しの説明文（redesign-maps の safetyCopy）。A5 で上の帯へ移したときに黙って消えていた
    // （検証の指摘）。まだいないときの文と登録の欄の添え書きだけでは、一覧を使っている職員の目に入らない
    await render();
    const lead = container.querySelector(".client-table-lead");
    // 読み上げ用に隠した物ではない（見える1行 ── 自分と祖先の隠す印を tests/helpers/markup.ts の判定で見る）
    expect(shown(lead)).toBe("利用者ごとに書類が貯まります（氏名は記号で表示）");
    // 表の直前に置き、表を箱で包まない（表は区画の直下 ── globals.css の `.pane:has(> .client-table)` が効く形）
    expect(lead?.nextElementSibling?.tagName).toBe("TABLE");
  });

  it("一覧を開いただけでは、どの行も選ばない", async () => {
    await render(null);
    expect(container.querySelectorAll("tr[data-selected]")).toHaveLength(0);
    expect(container.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
  });

  it("選んでいる利用者の行だけ印を付け、リンクに aria-current を付ける", async () => {
    await render("c2");
    const selected = [...container.querySelectorAll("tr[data-selected]")];
    expect(selected).toHaveLength(1);
    expect(shown(selected[0].querySelector("th"))).toBe("B様");
    const current = [...container.querySelectorAll('[aria-current="page"]')];
    expect(current.map((a) => a.getAttribute("href"))).toEqual(["/clients/c2"]);
  });
});

describe("記号・属性で探す", () => {
  it("入れた言葉で表を絞り、消すと全員に戻る（サーバーへは問い合わせない）", async () => {
    await render();
    await search("独居");
    expect(rowCodes()).toEqual(["A様"]);
    await search("B様");
    expect(rowCodes()).toEqual(["B様"]);
    await search("");
    expect(rowCodes()).toEqual(["A様", "B様", "F様"]);
    expect(calls.filter((c) => c === "GET /api/clients")).toHaveLength(1);
  });

  it("当てはまる人がいなければそう書き、「探す言葉を消す」で全員に戻る", async () => {
    await render();
    await search("要介護5");
    expect(rows()).toHaveLength(0);
    expect(shownAll()).toContain("「要介護5」に当てはまる利用者はいません");
    // 読めた一覧の絞り込みの結果なので、「まだ利用者がいません」とは言わない
    expect(text()).not.toContain("まだ利用者がいません");
    await click(buttonByText("探す言葉を消す"));
    expect(rowCodes()).toEqual(["A様", "B様", "F様"]);
  });
});

describe("まだ利用者がいないとき", () => {
  it("「まだ利用者がいません」と、氏名を暗号化して記号で表示する約束の文を出す（表は出さない）", async () => {
    listResponses = [() => json([])];
    await render();
    expect(shownAll()).toContain("まだ利用者がいません");
    expect(shownAll()).toContain("右上の「新しい利用者」から登録してください。");
    expect(shownAll()).toContain(
      "登録した氏名は暗号化して保存し、画面では A様 のような記号で表示します。",
    );
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    // 以前の置き場所の言い方「右上の「新規」」は使わない
    expect(text()).not.toContain("「新規」");
  });
});

describe("一覧を読めなかったとき（「まだ利用者がいません」に見せない）", () => {
  /** 読めなかったときの画面の決まり: 知らせ（role="alert"）に見出しとサーバーの文。空の一覧の文も表も出さない */
  function expectLoadError(serverMessage?: string) {
    const alert = shown(container.querySelector('[role="alert"]'));
    expect(alert).toContain("利用者一覧を読めませんでした");
    if (serverMessage) expect(alert).toContain(serverMessage);
    // 隠して出しても「出ていない」と取り違えないよう、HTML 全体で見る
    expect(container.innerHTML).not.toContain("まだ利用者がいません");
    expect(container.querySelector("table")).toBeNull();
  }

  it("API が 500 なら、見出しとサーバーの文を出す", async () => {
    listResponses = [
      () =>
        json(
          {
            error:
              "利用者一覧を読めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。",
          },
          500,
        ),
    ];
    await render();
    expectLoadError("少し待ってから、もう一度お試しください");
    // 見出しを二重に付けない
    expect(text().match(/利用者一覧を読めませんでした/g)).toHaveLength(1);
  });

  it("ログイン切れ（401）でも、何が読めなかったのかが分かる形で出す", async () => {
    listResponses = [() => json({ error: "ログインが必要です。" }, 401)];
    await render();
    expectLoadError("利用者一覧を読めませんでした。ログインが必要です。");
  });

  it("通信が切れた・本文が JSON でない・配列でない、も「読めなかった」にする（0人にしない）", async () => {
    for (const respond of [
      () => Promise.reject(new TypeError("Failed to fetch")),
      () => new Response("<html>ログイン</html>", { status: 200 }),
      () => json({ clients: [] }),
    ]) {
      listResponses = [respond];
      await render();
      expectLoadError();
      act(() => root?.unmount());
      root = null;
    }
  });

  it("「一覧をもう一度読む」で読み直し、読めたら表が出る", async () => {
    listResponses = [() => json({ error: "ログインが必要です。" }, 401), () => json(API_ROWS)];
    await render();
    expectLoadError();
    await click(buttonByText("一覧をもう一度読む"));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(rowCodes()).toEqual(["A様", "B様", "F様"]);
    expect(calls.filter((c) => c === "GET /api/clients")).toHaveLength(2);
  });
});

describe("表の見た目の決まり（app/globals.css）", () => {
  /** globals.css の規則を @layer / @media の中まで降りて集め、[選択子, 宣言, 包んでいる @ 規則] にする */
  function allRules(): { selector: string; declarations: string; context: string[] }[] {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    const out: { selector: string; declarations: string; context: string[] }[] = [];
    const visit = (nodes: CssNode[], context: string[]) => {
      for (const node of nodes) {
        if (node.prelude.startsWith("@")) {
          visit(node.children, [...context, node.prelude]);
          continue;
        }
        out.push({
          selector: node.prelude.trim().replace(/\s+/g, " "),
          declarations: node.declarations,
          context,
        });
      }
    };
    visit(parseCss(css), []);
    return out;
  }

  /**
   * 選択子がちょうど selector の規則の property の値（部品に足す Tailwind の指定が勝てるよう、層の中にあること）。
   * within を渡すと、その @ 規則（@media など）の中の規則だけを見る。
   */
  function cssValuesOf(selector: string, property: string, within?: RegExp): string[] {
    return allRules()
      .filter(
        (r) =>
          r.selector === selector &&
          r.context.includes("@layer components") &&
          (!within || r.context.some((c) => within.test(c))),
      )
      .flatMap((r) =>
        [...r.declarations.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map(
          (m) => m[1].trim(),
        ),
      );
  }

  it("選んでいる行の地は --row-selected（ほかの行は地を持たない）", () => {
    expect(cssValuesOf(".client-table tbody tr[data-selected]", "background")).toEqual([
      "var(--row-selected)",
    ]);
    expect(cssValuesOf(".client-table tbody tr", "background")).toEqual([]);
  });

  it("アートボードの寸法: 見出しの行 40px・行 52px・行の区切り 1px", () => {
    expect(cssValuesOf(".client-table thead th", "height")).toEqual(["40px"]);
    expect(cssValuesOf(".client-table tbody tr", "height")).toEqual(["52px"]);
    expect(cssValuesOf(".client-table tbody tr", "border-bottom")).toEqual([
      "1px solid var(--line-inner)",
    ]);
  });

  it("768px 以上で表を直下に持つ区画は、貼りついた見出しの行の高さぶんフォーカスの止まる位置を下げる", () => {
    // A5 の検証: 区画に頭の帯が無いので --sticky-top が 0 のままだった。Shift+Tab で表を上へ戻ると、移った先の
    // 記号のリンクが区画の上端から 8〜52px に止まり、0〜40px を覆う見出しの行の裏に隠れた（WCAG 2.2 AA 2.4.11）。
    // 区画の scroll-padding-top が calc(var(--sticky-top) + 8px) であることは components/ui/primitives.test.tsx が見る。
    // レイアウトは jsdom では測れないので、ここは規則を見る（実際の位置の計測は docs/REDESIGN-A-SIGNOFF.md）
    const WIDE = /^@media\s*\(min-width:\s*768px\)/;
    const headHeight = cssValuesOf(".client-table thead th", "height");
    expect(cssValuesOf(".client-table thead th", "position")).toEqual(["sticky"]);
    expect(cssValuesOf(".client-table thead th", "top")).toEqual(["0"]);
    // 見出しの行の高さを変えたら、逃がす幅も一緒に変わっていないと赤にする（片方だけ直すずれを止める）
    expect(cssValuesOf(".pane:has(> .client-table)", "--sticky-top", WIDE)).toEqual(headHeight);
    expect(headHeight).toEqual(["40px"]);
    // 768px 以上の中だけに置く（スマホは文書が動き、見出しの行は上の帯の裏に入る）
    const all = allRules().filter((r) => r.selector === ".pane:has(> .client-table)");
    expect(all.length).toBeGreaterThan(0);
    for (const rule of all) expect(rule.context.some((c) => WIDE.test(c))).toBe(true);
  });

  it("表の上の約束の1行は、地（--paper）の上で読める文字色（--muted ── 4.5:1 は app/globals.test.ts）", () => {
    expect(cssValuesOf(".client-table-lead", "color")).toEqual(["var(--muted)"]);
  });

  it("記号と登録日は等幅の書体（氏名ではなく符号・日付であることを書体で示す）", () => {
    expect(cssValuesOf(".client-code-link", "font-family")).toEqual(["var(--mono)"]);
    expect(cssValuesOf(".client-date", "font-family")).toEqual(["var(--mono)"]);
  });
});
