// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientsPage from "@/app/(dashboard)/clients/page";
import TopBar from "@/components/shell/TopBar";
import { TopBarSlotProvider } from "@/components/shell/TopBarSlot";
import ClientsLayout from "./ClientsLayout";

/**
 * 利用者の画面の作業台（components/clients/ClientsLayout.tsx ＋ app/(dashboard)/clients/page.tsx）を、
 * 本物の上の帯（TopBar・差し込み口）と一緒に動かして確かめる（2026-09-24 A5 ＝ 計画 U2）。
 * 偽物にするのは通信（fetch）・Next.js の道具（URL・画面の移動・リンク）・Clerk の組織の状態だけ。
 *
 * なぜ必要か:
 *   - **一覧を開いただけでは誰も選ばない**。右の区画に関係者名簿（家族などの実名）が出るのは、行を押して
 *     その方の URL（/clients/{id}）を開いたときだけ（吉本さん決定 2026-09-23）。
 *   - 選んでいる行の印は URL に付いてくる。選び替えても表は消えず、一覧も読み直さない（layout に置いた理由）。
 *   - 新しい利用者は右の区画（/clients?new=1）で登録し、読み直さずに表へ出る（計画 U2 の指摘 ── 表と登録の欄は別の部品）。
 *   - 一覧を読めないあいだは登録を止める（もういる方を気づかずに二重に登録しないため）。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const env = vi.hoisted(() => ({
  pathname: "/clients",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => env.pathname,
  useSearchParams: () => new URLSearchParams(env.search),
  useRouter: () => ({ push: env.push }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

vi.mock("@clerk/nextjs", () => ({
  useOrganization: () => ({ isLoaded: true, organization: null }),
  OrganizationSwitcher: () => createElement("div", { "data-org-switcher": "" }),
}));

const CLIENT_A = {
  id: "c1",
  orgId: null,
  code: "A",
  attributes: { age: "85歳", household: "独居" },
  createdBy: "u1",
  createdAt: "2026-09-01T00:00:00+09:00",
  updatedAt: "2026-09-01T00:00:00+09:00",
};
const CLIENT_B = { ...CLIENT_A, id: "c2", code: "B", attributes: { age: "91歳" } };
/** 登録の応答（POST /api/clients の 201）。氏名は返らない */
const CREATED = { ...CLIENT_A, id: "c9", code: "C", attributes: { age: "80歳" } };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 呼ばれた通信の記録（"GET /api/clients" の形）と、POST の本文 */
let calls: string[] = [];
let postedBodies: unknown[] = [];
/** GET /api/clients の応答 */
let listResponse: () => Response = () => json([CLIENT_A, CLIENT_B]);

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  env.pathname = "/clients";
  env.search = "";
  env.push = vi.fn();
  calls = [];
  postedBodies = [];
  listResponse = () => json([CLIENT_A, CLIENT_B]);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url === "/api/clients" && method === "GET") return listResponse();
      if (url === "/api/clients" && method === "POST") {
        postedBodies.push(JSON.parse(String(init?.body)));
        return json(CREATED, 201);
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

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** 外枠（app/(dashboard)/layout.tsx）と同じ並び: 差し込み口を共有する中に、上の帯と本文。本文に利用者の作業台 */
async function render(page: ReactNode) {
  if (!root) root = createRoot(container);
  await act(async () => {
    root?.render(
      <TopBarSlotProvider>
        <TopBar />
        <main>
          <ClientsLayout>{page}</ClientsLayout>
        </main>
      </TopBarSlotProvider>,
    );
  });
  await flush();
}

/** /clients のページ（サーバーの部品）を、URL の ?new= の値で描いた中身 */
async function listPage(newParam?: string) {
  return ClientsPage({ searchParams: Promise.resolve(newParam ? { new: newParam } : {}) });
}

const q = <E extends Element = Element>(selector: string) => container.querySelector<E>(selector);
const aside = () => q("main aside");
const slot = () => q(".topbar-slot");
const selectedCodes = () =>
  [...container.querySelectorAll("tr[data-selected]")].map(
    (tr) => tr.querySelector("th")?.textContent,
  );
const tableCodes = () =>
  [...container.querySelectorAll("tbody tr")].map((tr) => tr.querySelector("th")?.textContent);

async function type(selector: string, value: string) {
  const input = q<HTMLInputElement>(selector);
  if (!input) throw new Error(`${selector} が見つかりません`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitButton(): HTMLButtonElement {
  const button = q<HTMLButtonElement>('main aside button[type="submit"]');
  if (!button) throw new Error("登録のボタンが見つかりません");
  return button;
}

describe("一覧を開いたとき（/clients）", () => {
  it("誰も選ばず、右の区画は案内だけ。その方の詳細（関係者名簿など）は読みにいかない", async () => {
    await render(await listPage());
    expect(tableCodes()).toEqual(["A様", "B様"]);
    expect(selectedCodes()).toEqual([]);
    expect(container.querySelectorAll('tbody [aria-current="page"]')).toHaveLength(0);
    expect(aside()?.getAttribute("aria-label")).toBe("利用者の詳細");
    expect(aside()?.textContent).toBe("左の一覧から利用者を選ぶと、書類と関係者名簿がここに出ます");
    // 一覧の問い合わせだけ（/api/clients/{id} や関係者名簿 /api/clients/{id}/related は呼ばない）
    expect(calls).toEqual(["GET /api/clients"]);
  });

  it("上の帯に 見出し「利用者」と人数・「記号・属性で探す」・「新しい利用者」（本文には置かない）", async () => {
    await render(await listPage());
    expect(slot()?.querySelector("h1")?.textContent).toBe("利用者");
    expect(slot()?.querySelector(".clients-count")?.textContent).toBe("2人");
    const search = slot()?.querySelector('input[aria-label="記号・属性で探す"]');
    expect(search?.getAttribute("placeholder")).toBe("記号・属性で探す");
    const add = slot()?.querySelector('a[href="/clients?new=1"]');
    expect(add?.textContent).toBe("新しい利用者");
    expect(add?.getAttribute("aria-current")).toBeNull();
    // 見出しは画面に1つ（本文側に2つ目の h1 を置かない）
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(q("main h1")).toBeNull();
  });

  it("表は一覧の区画の直下に置く（包む箱を足すと、見出しの行の裏にフォーカスが隠れる）", async () => {
    // app/globals.css の `.pane:has(> .client-table)` は「区画の直下の表」だけに効く。表を div などで包むと
    // 規則が黙って外れ、Shift+Tab で上へ戻った記号のリンクが貼りついた見出しの行の裏に隠れる（A5 の検証）
    await render(await listPage());
    const table = q("main table.client-table");
    expect(table?.parentElement?.matches('section.pane[aria-label="利用者の一覧"]')).toBe(true);
    // 約束の1行も同じ区画の直下（表の直前）
    expect(table?.previousElementSibling?.matches(".client-table-lead")).toBe(true);
  });

  it("一覧を読めないあいだは人数を出さない（0人と見せない）", async () => {
    listResponse = () => json({ error: "ログインが必要です。" }, 401);
    await render(await listPage());
    expect(slot()?.querySelector(".clients-count")).toBeNull();
    expect(q('[role="alert"]')?.textContent).toContain("利用者一覧を読めませんでした");
  });
});

describe("行を選んだとき（/clients/{id}）", () => {
  it("URL の利用者の行だけに印が付き、選び替えると印も付いてくる。表は読み直さない", async () => {
    env.pathname = "/clients/c2";
    await render(<p>B様の詳細</p>);
    expect(selectedCodes()).toEqual(["B様"]);
    expect(aside()?.textContent).toBe("B様の詳細");
    expect(aside()?.getAttribute("aria-label")).toBe("B様");

    env.pathname = "/clients/c1";
    await render(<p>A様の詳細</p>);
    expect(selectedCodes()).toEqual(["A様"]);
    expect(aside()?.getAttribute("aria-label")).toBe("A様");
    expect(calls.filter((c) => c === "GET /api/clients")).toHaveLength(1);

    // 一覧に戻ると、誰も選んでいない状態に戻る
    env.pathname = "/clients";
    await render(await listPage());
    expect(selectedCodes()).toEqual([]);
  });

  it("上の帯は道しるべ「利用者 / B様」（利用者は一覧へのリンク）。探す欄と「新しい利用者」は残る", async () => {
    env.pathname = "/clients/c2";
    await render(<p>B様の詳細</p>);
    const crumbs = slot()?.querySelector('nav[aria-label="現在地"]');
    expect(crumbs?.querySelector("a")?.getAttribute("href")).toBe("/clients");
    expect(crumbs?.textContent).toBe("利用者/B様");
    expect(crumbs?.querySelector('[aria-current="page"]')?.textContent).toBe("B様");
    expect(slot()?.querySelector("h1")).toBeNull();
    expect(slot()?.querySelector('input[aria-label="記号・属性で探す"]')).not.toBeNull();
    expect(slot()?.querySelector('a[href="/clients?new=1"]')).not.toBeNull();
  });
});

describe("新しい利用者の登録（/clients?new=1）", () => {
  it("右の区画に登録の欄（以前と同じ欄の id・名前・添え書き）。「新しい利用者」は押している状態", async () => {
    env.search = "new=1";
    await render(await listPage("1"));
    for (const id of ["c-name", "c-age", "c-gender", "c-care-level", "c-household"]) {
      expect(q(`main aside #${id}`)).not.toBeNull();
    }
    const labels = [...container.querySelectorAll("main aside label")].map((l) => l.textContent);
    expect(labels).toEqual(["氏名（任意）", "年齢", "性別", "要介護度", "世帯"]);
    expect(aside()?.textContent).toContain("氏名は暗号化して保存し、画面では記号で表示します");
    expect(aside()?.getAttribute("aria-label")).toBe("新しい利用者");
    const add = slot()?.querySelector('a[href="/clients?new=1"]');
    expect(add?.getAttribute("aria-current")).toBe("page");
    // 押した色は Tailwind の aria 条件つきの指定で付ける。globals.css（層 components）の規則にすると、
    // btnSecondary の白い地（層 utilities）に負けて効かなかった（2026-09-24 A5 の本番用ビルドでの計測）
    expect(add?.getAttribute("class")).toContain("aria-[current=page]:bg-[var(--active)]");
    // 登録の欄を開いても、誰も選ばない
    expect(selectedCodes()).toEqual([]);
  });

  it("登録すると、読み直さずに表の先頭に出て、その方の画面を開く（氏名は表に出ない）", async () => {
    env.search = "new=1";
    await render(await listPage("1"));
    await type("#c-name", "山田 花子");
    await type("#c-age", "80歳");
    await act(async () => {
      submitButton().click();
    });
    await flush();

    expect(postedBodies).toEqual([
      { name: "山田 花子", attributes: { age: "80歳", gender: "", careLevel: "", household: "" } },
    ]);
    expect(tableCodes()).toEqual(["C様", "A様", "B様"]);
    expect(calls.filter((c) => c === "GET /api/clients")).toHaveLength(1);
    expect(env.push).toHaveBeenCalledWith("/clients/c9");
    expect(q("table")?.textContent).not.toContain("山田");
    expect(slot()?.querySelector(".clients-count")?.textContent).toBe("3人");
  });

  it("一覧を読めないあいだは登録を止める（もういる方を気づかずに二重に登録しないため）", async () => {
    listResponse = () => json({ error: "ログインが必要です。" }, 401);
    env.search = "new=1";
    await render(await listPage("1"));
    expect(submitButton().disabled).toBe(true);
    expect(aside()?.textContent).toContain("同じ方を二重に登録しないよう、登録を止めています");
    await type("#c-name", "山田 花子");
    await act(async () => {
      submitButton().click();
    });
    await flush();
    expect(calls.filter((c) => c.startsWith("POST"))).toHaveLength(0);
  });

  it("登録に失敗したら、サーバーの文を出して画面は移らない", async () => {
    env.search = "new=1";
    await render(await listPage("1"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        (init?.method ?? "GET") === "POST"
          ? json({ error: "利用者の作成に失敗しました。" }, 500)
          : json([CLIENT_A, CLIENT_B]),
      ),
    );
    await act(async () => {
      submitButton().click();
    });
    await flush();
    expect(q('main aside [role="alert"]')?.textContent).toContain("利用者の作成に失敗しました。");
    expect(env.push).not.toHaveBeenCalled();
    expect(tableCodes()).toEqual(["A様", "B様"]);
  });
});
