// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientDetailPage from "@/app/(dashboard)/clients/[id]/page";
import { DOC_ORDER, DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import type { CareDocumentRecord, CareDocumentType } from "@/types/document";
import ClientPane from "./ClientPane";

/**
 * 利用者の区画（components/clients/ClientPane.tsx ＋ app/(dashboard)/clients/[id]/page.tsx）を、画面を実際に動かして確かめる
 * （2026-09-24 A6 ＝ 計画 U3b）。偽物にするのは通信（fetch）・next/link（ただの <a>）・書類の中身の表示部品だけ。
 *
 * なぜ必要か:
 *   - 「仮名表示中」と（仮名）は、画面が記号で出していることを伝える約束（仕様 ui-redesign-and-client-storage の受け入れ条件）。
 *     アートボードには無いので、作り替えで落ちやすい。
 *   - 書類を種類ごとの1行にまとめても、**以前の版を1つも開けなくしない**（承認した版に戻れなくなる）。
 *   - 状態の札（下書き／承認済み）を行から消さない（承認前の書類をそれと分からず使わせない）。
 *   - つくるへのリンクは利用者と種類を URL で運ぶ（/create?client=…&type=…）。
 *   - 頭と書類の行に実名を描かない（API の応答に氏名が紛れても出さない）。実名は関係者名簿の中だけ。
 *   - 緑の主ボタンは1画面に1つ。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// React に「テストの中で act を使って動かしている」と伝える（伝えないと act のたびに警告がログを埋める）
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));

// 書類の中身の表示。ここで見るのは区画の組み立てなので、中身は描かない
vi.mock("@/components/drafts/AssessmentDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/CarePlanDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/MeetingSummaryDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/MonitoringDraftView", () => ({ default: () => null }));
vi.mock("@/components/drafts/SupportLogDraftView", () => ({ default: () => null }));

/** 利用者の記録。本物の API は氏名を返さないが、紛れ込んでも出ないことを見るために name を入れておく */
const CLIENT = {
  id: "c1",
  orgId: null,
  code: "B",
  attributes: { age: "91歳", gender: "男性", careLevel: "要介護3", household: "長女と同居" },
  createdBy: "u1",
  createdAt: "2026-08-01T00:00:00+09:00",
  updatedAt: "2026-08-01T00:00:00+09:00",
  name: "山田 太郎",
};

function doc(
  id: string,
  docType: CareDocumentType,
  status: "draft" | "approved",
  createdAt: string,
): CareDocumentRecord {
  return {
    id,
    clientId: "c1",
    orgId: null,
    docType,
    status,
    content: {},
    source: "rescue",
    retentionUntil: "2031-09-01",
    approvedAt: status === "approved" ? createdAt : null,
    approvedBy: status === "approved" ? "u1" : null,
    createdBy: "u1",
    createdAt,
    updatedAt: createdAt,
  };
}

/** ケアプランは3版（新しい順に p1 → p0 → p00）。モニタリングはまだ無い */
const DOCS: CareDocumentRecord[] = [
  doc("s1", "supportLog", "approved", "2026-09-17T11:00:00+09:00"),
  doc("m1", "meetingSummary", "draft", "2026-09-17T10:00:00+09:00"),
  doc("p1", "carePlan", "draft", "2026-08-28T10:00:00+09:00"),
  doc("a1", "assessment", "approved", "2026-08-20T10:00:00+09:00"),
  doc("p0", "carePlan", "approved", "2026-07-01T10:00:00+09:00"),
  doc("p00", "carePlan", "draft", "2026-06-01T10:00:00+09:00"),
];

const RELATED = [
  { id: "r1", clientId: "c1", relation: "長女", name: "佐藤 花子", createdAt: "2026-08-01" },
];
const TRANSCRIPTS = {
  transcripts: [
    {
      id: "t1",
      clientId: "c1",
      kind: "meeting",
      title: "9月の会議",
      chars: 3214,
      createdAt: "2026-09-17T00:00:00Z",
      retentionUntil: "2031-09-17T00:00:00Z",
    },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** "GET /api/clients/c1" の形の通信ごとの応答 */
let routes: Record<string, () => Response> = {};
let calls: string[] = [];

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/clients/c1": () => json({ client: CLIENT, documents: DOCS }),
    "GET /api/clients/c1/related": () => json(RELATED),
    "GET /api/transcripts?clientId=c1": () => json(TRANSCRIPTS),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const key = `${init?.method ?? "GET"} ${url}`;
      calls.push(key);
      const route = routes[key];
      if (!route) throw new Error(`想定外の通信: ${key}`);
      return route();
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

async function render(node: ReactNode) {
  if (!root) root = createRoot(container);
  await act(async () => {
    root?.render(node);
  });
  await flush();
}

const pane = (docId: string | null = null) => render(<ClientPane clientId="c1" docId={docId} />);

/** 見出しの文字で、まとまり（section aria-labelledby）を探す */
function sectionTitled(title: string): HTMLElement | null {
  for (const section of container.querySelectorAll<HTMLElement>("section[aria-labelledby]")) {
    const id = section.getAttribute("aria-labelledby") ?? "";
    if (document.getElementById(id)?.textContent === title) return section;
  }
  return null;
}
const docsSection = () => sectionTitled("書類");
const header = () => container.querySelector("header");
const hrefs = (root: ParentNode | null) =>
  [...(root?.querySelectorAll("a") ?? [])].map((a) => a.getAttribute("href") ?? "");
/** 緑の主ボタン（btnPrimary の地 bg-[var(--green)]）の数。緑の札（--green-soft）は数えない */
const greenPrimaries = () =>
  [...container.querySelectorAll("a, button")].filter((el) =>
    (el.getAttribute("class") ?? "").split(/\s+/).includes("bg-[var(--green)]"),
  );
/** 種類の名前で書類の行（li の最初の行）を探す */
function docRow(type: CareDocumentType): HTMLElement | null {
  const label = DOC_TYPE_LABELS[type].saved;
  for (const li of docsSection()?.querySelectorAll<HTMLElement>(":scope > ul > li") ?? []) {
    const row = li.querySelector<HTMLElement>(":scope > .client-pane-row");
    if (row?.firstElementChild?.textContent === label) return row;
  }
  return null;
}
const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);

describe("頭（記号・仮名・属性・つくる）", () => {
  it("記号（等幅 30px の h2）に（仮名）と「仮名表示中」が付き、属性の1行が出る", async () => {
    await pane();
    const h2 = header()?.querySelector("h2");
    expect(h2?.textContent).toBe("B様（仮名）");
    expect(h2?.classList.contains("client-pane-code")).toBe(true);
    expect(header()?.textContent).toContain("仮名表示中");
    expect(header()?.textContent).toContain("91歳・男性・要介護3・長女と同居");
  });

  it("属性が無ければ「（属性未設定）」", async () => {
    routes["GET /api/clients/c1"] = () =>
      json({ client: { ...CLIENT, attributes: {} }, documents: DOCS });
    await pane();
    expect(header()?.textContent).toContain("（属性未設定）");
  });

  it("「つくる」は利用者を運ぶ /create?client=c1 で、画面の緑の主ボタンはこれ1つ", async () => {
    await pane();
    const make = [...(header()?.querySelectorAll("a") ?? [])].find((a) =>
      a.textContent?.includes("つくる"),
    );
    expect(make?.getAttribute("href")).toBe("/create?client=c1");
    expect(greenPrimaries()).toEqual([make]);
  });
});

describe("書類（種類ごとに1行・以前の版）", () => {
  it("DOC_ORDER の5種類が1行ずつ、その順に並ぶ", async () => {
    await pane();
    const labels = [
      ...(docsSection()?.querySelectorAll(":scope > ul > li > .client-pane-row") ?? []),
    ].map((row) => row.firstElementChild?.textContent);
    expect(labels).toEqual(DOC_ORDER.map((t) => DOC_TYPE_LABELS[t].saved));
  });

  it("ある種類は、いちばん新しい版の状態の札・保存した日（日本時間）・「開く」（?doc=）", async () => {
    await pane();
    const carePlan = docRow("carePlan");
    expect(carePlan?.textContent).toContain("下書き");
    expect(carePlan?.querySelector(".client-pane-date")?.textContent).toBe("2026/08/28");
    expect(hrefs(carePlan)).toEqual(["/clients/c1?doc=p1"]);
    const assessment = docRow("assessment");
    expect(assessment?.textContent).toContain("承認済み");
    expect(hrefs(assessment)).toEqual(["/clients/c1?doc=a1"]);
  });

  it("まだ無い種類は「まだありません」と、種類つきの「つくる」（/create?client=c1&type=…）", async () => {
    await pane();
    const monitoring = docRow("monitoring");
    expect(monitoring?.textContent).toContain("まだありません");
    expect(hrefs(monitoring)).toEqual(["/create?client=c1&type=monitoring"]);
  });

  it("以前の版は「以前の版（n）」の中に新しい順で並び、どの版も開ける", async () => {
    await pane();
    const summary = docsSection()?.querySelector("details.client-doc-older > summary");
    expect(summary?.textContent).toContain("以前の版（2）");
    const olderLinks = hrefs(summary?.parentElement ?? null);
    expect(olderLinks).toEqual(["/clients/c1?doc=p0", "/clients/c1?doc=p00"]);
    // 保存した書類はどれも、区画のどこかの「開く」から開ける（1つも落とさない）
    const opened = hrefs(docsSection())
      .filter((h) => h.includes("?doc="))
      .map((h) => h.split("?doc=")[1]);
    expect([...opened].sort()).toEqual(DOCS.map((d) => d.id).sort());
  });

  it("書類が自分の保存した分だけであることを、見出しの下に書く", async () => {
    await pane();
    expect(docsSection()?.textContent).toContain("ここに出る書類は、自分が保存したものだけです");
  });

  it("「一式まとめて」は利用者を運ぶ /rescue?client=c1", async () => {
    await pane();
    const bundle = [...(docsSection()?.querySelectorAll("a") ?? [])].find((a) =>
      a.textContent?.includes("一式まとめて"),
    );
    expect(bundle?.getAttribute("href")).toBe("/rescue?client=c1");
  });

  it("書類が1つも無ければ、5種類とも「つくる」で、作り方の文を出す", async () => {
    routes["GET /api/clients/c1"] = () => json({ client: CLIENT, documents: [] });
    await pane();
    expect(docsSection()?.textContent).toContain(
      "「つくる」の「一式まとめて」から作って保存できます",
    );
    for (const type of DOC_ORDER) {
      expect(hrefs(docRow(type))).toEqual([`/create?client=c1&type=${type}`]);
    }
  });

  it("頭と書類の行に実名を描かない（API の応答に氏名が紛れても出さない）", async () => {
    await pane();
    for (const part of [header(), docsSection()]) {
      expect(part?.textContent).not.toContain("山田");
      expect(part?.textContent).not.toContain("佐藤");
    }
    expect(container.textContent).not.toContain("山田 太郎");
  });
});

it("区画の並びは 書類 → 関係者名簿 → 文字起こし", async () => {
  await pane();
  const headings = [...container.querySelectorAll("h3")].map((h) => h.textContent ?? "");
  const docs = headings.indexOf("書類");
  const related = headings.indexOf("関係者名簿");
  const transcripts = headings.findIndex((h) => h.includes("文字起こし"));
  expect(docs).toBeGreaterThanOrEqual(0);
  expect(docs).toBeLessThan(related);
  expect(related).toBeLessThan(transcripts);
});

describe("書類を開いたとき（?doc=）", () => {
  it("下書きなら承認の操作が出て、「承認する」が緑の主ボタン（「つくる」は脇のボタンになる）", async () => {
    await pane("p1");
    const approve = buttonByText("承認する");
    expect(approve).toBeDefined();
    expect(greenPrimaries()).toEqual([approve]);
    expect(container.textContent).toContain("承認後にコピーできます");
    expect(hrefs(container)).toContain("/clients/c1");
  });

  it("書類を開いているあいだは、関係者名簿（実名）も文字起こしも読みにいかない", async () => {
    await pane("p1");
    expect(calls).toEqual(["GET /api/clients/c1"]);
    expect(container.textContent).not.toContain("佐藤");
  });

  it("承認済みなら「承認を取り消す」が出て、緑の主ボタンは頭の「つくる」", async () => {
    await pane("a1");
    expect(buttonByText("承認を取り消す")).toBeDefined();
    const primaries = greenPrimaries();
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.textContent).toContain("つくる");
  });

  it("以前の版も同じように開ける", async () => {
    await pane("p00");
    expect(container.querySelector("h3")?.textContent).toBe(DOC_TYPE_LABELS.carePlan.saved);
    expect(container.querySelector(".client-pane-date")?.textContent).toBe("2026/06/01");
  });

  it("承認が通ったら、開いたままの書類の札と主ボタンが入れ替わる", async () => {
    routes["PATCH /api/documents/p1"] = () =>
      json({ ...DOCS[2], status: "approved", approvedAt: "2026-09-24T09:00:00+09:00" });
    await pane("p1");
    await act(async () => {
      buttonByText("承認する")?.click();
    });
    await flush();
    expect(buttonByText("承認を取り消す")).toBeDefined();
    expect(greenPrimaries()[0]?.textContent).toContain("つくる");
  });

  it("一覧に無い書類の id なら、開けなかったことを文字で出す", async () => {
    await pane("nope");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "この書類を開けませんでした",
    );
  });
});

describe("読み込めなかったとき", () => {
  it("サーバーの文と「利用者一覧へ」を出す（空の区画に見せない）", async () => {
    routes["GET /api/clients/c1"] = () => json({ error: "利用者が見つかりません。" }, 404);
    await pane();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "利用者が見つかりません。",
    );
    expect(hrefs(container)).toEqual(["/clients"]);
  });

  it("通信そのものが失敗したら、通信環境を確かめる文を出す", async () => {
    routes["GET /api/clients/c1"] = () => {
      throw new TypeError("Failed to fetch");
    };
    await pane();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("通信環境を確かめて");
  });
});

describe("ページ（/clients/{id}）", () => {
  it("URL の ?doc= を区画へ渡す", async () => {
    await render(
      await ClientDetailPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ doc: "p1" }),
      }),
    );
    expect(buttonByText("承認する")).toBeDefined();
  });

  it("?doc= が無い・複数ある ときは書類の一覧を出す", async () => {
    await render(
      await ClientDetailPage({
        params: Promise.resolve({ id: "c1" }),
        searchParams: Promise.resolve({ doc: ["p1", "a1"] }),
      }),
    );
    expect(docsSection()).not.toBeNull();
    expect(buttonByText("承認する")).toBeUndefined();
  });
});
