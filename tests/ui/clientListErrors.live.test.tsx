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
 * 救済モードの保存パネルは、途中の1枚で失敗したあとの押し直しも動かして確かめる（2026-09-24 検収の指摘）。
 * 以前は押し直すたびに利用者をもう1人作り、保存済みの帳票も二重に保存していた（同じ方の二重登録の別の入口）。
 *
 * 利用者の画面の関係者名簿・保存した文字起こしと、ダッシュボードの評価の履歴も、読めなかったとき（サーバが 503）に
 * 空・0件に見せないことを確かめる（同じ日の検収の指摘 ── サーバは DB の失敗を 503 で返すようになったが、
 * 画面がそれを黙って捨てると職員には同じに見える）。
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
// ダッシュボードの推移グラフ。ここで見るのは履歴を読めたかどうかだけで、グラフの部品は読み込みが重い（jsdom で数十秒）ので描かない
vi.mock("recharts", () => {
  const none = () => null;
  return {
    CartesianGrid: none,
    Line: none,
    LineChart: none,
    ReferenceLine: none,
    ResponsiveContainer: none,
    Tooltip: none,
    XAxis: none,
    YAxis: none,
  };
});

// 利用者の一覧（ClientsLayout）が URL を読む。/clients を開いた状態にする（Next.js の外では URL の道具が値を返さない）
vi.mock("next/navigation", () => ({
  usePathname: () => "/clients",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: () => undefined }),
}));

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
/** POST /api/documents で送った本文（保存先と帳票の種類） */
let documentPosts: { clientId: unknown; docType: unknown }[] = [];
/** POST /api/documents の何回目（1から数える）を 503 にするか */
let failDocumentCalls: number[] = [];
/** POST /api/clients が作った利用者の数（作るたびに new-1, new-2 … と別の id を返す） */
let createdClients = 0;
/** そのほかの通信（"GET /api/history" の形）に順番に返す応答（最後の1つは何度でも返す） */
let routes: Record<string, (() => Response)[]> = {};
/** POST /api/rescue の返事に足すもの（一時保管の削除の警告 warnings など） */
let rescueExtra: Record<string, unknown> = {};
/** POST /api/rescue の返事の状態番号（失敗の返事を試すとき 503 など） */
let rescueStatus = 200;

/** 利用者を DB から読めなかったとき（app/api/documents/route.ts の 503）の文言。押し直しを勧める */
const LOOKUP_FAILED =
  "利用者の情報を読み込めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";

function installFetch() {
  calls = [];
  documentPosts = [];
  failDocumentCalls = [];
  createdClients = 0;
  routes = {};
  rescueExtra = {};
  rescueStatus = 200;
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
      if (url === "/api/clients" && method === "POST") {
        createdClients += 1;
        return json({ ...CLIENT_A, id: `new-${createdClients}`, code: "B" }, 201);
      }
      if (url === "/api/documents" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { clientId: unknown; docType: unknown };
        documentPosts.push({ clientId: body.clientId, docType: body.docType });
        if (failDocumentCalls.includes(documentPosts.length)) {
          return json({ error: LOOKUP_FAILED }, 503);
        }
        return json({ id: `d${documentPosts.length}` }, 201);
      }
      if (url === "/api/rescue" && method === "POST") {
        return json(
          {
            assessment: {},
            carePlan: {},
            meetingSummary: {},
            supportLog: {},
            monitoring: {},
            ...rescueExtra,
          },
          rescueStatus,
        );
      }
      const queue = routes[`${method} ${url}`];
      if (queue && queue.length > 0) {
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (next) return next();
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

describe("救済モードの保存の押し直し（/rescue・2026-09-24 検収の指摘）", () => {
  /** 人物像を1つ書いて一式を作り、保存パネルが出るところまで進める（一覧は A様 だけ読める） */
  async function renderResult() {
    listResponses = [() => json([CLIENT_A])];
    const { default: RescuePage } = await import("@/app/(dashboard)/rescue/page");
    await render(<RescuePage />);
    await typeInto("#f-personality", "穏やかな方");
    await click(buttonByText("書類一式を生成する"));
    if (!container.querySelector("#save-client")) throw new Error("保存パネルが出ていません");
  }

  /** ブラウザと同じ手順で値を入れて、React が拾える input / change を起こす */
  async function typeInto(selector: string, value: string) {
    const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      selector,
    );
    if (!el) throw new Error(`${selector} が見つかりません`);
    const proto = Object.getPrototypeOf(el) as object;
    const setValue = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    await act(async () => {
      setValue?.call(el, value);
      el.dispatchEvent(
        new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
      );
    });
  }

  /** 保存の押しボタン（文言は「この利用者に5帳票を保存」か「残りのN帳票を保存」） */
  function saveButton(): HTMLButtonElement {
    const found = [...container.querySelectorAll("button")].find((b) =>
      /^(この利用者に5帳票を保存|残りの\d帳票を保存)$/.test(b.textContent?.trim() ?? ""),
    );
    if (!found) throw new Error("保存のボタンが見つかりません");
    return found;
  }

  const savedPairs = () => documentPosts.map((p) => `${String(p.clientId)}:${String(p.docType)}`);

  it("新しい利用者で3枚目が失敗し、押し直しても利用者は1人だけ・各帳票はその利用者へ1回ずつ", async () => {
    await renderResult();
    await typeInto("#new-client-name", "テスト花子");
    failDocumentCalls = [3];

    await click(saveButton());
    expect(visibleText()).toContain(LOOKUP_FAILED);
    expect(calls.filter((c) => c === "POST /api/clients")).toHaveLength(1);
    // 保存先を選び直させず、どこへ・あと何枚かを画面の文字で出す
    expect(container.querySelector("#save-client")).toBeNull();
    expect(container.querySelector("#new-client-name")).toBeNull();
    expect(visibleText()).toContain("B様");
    expect(visibleText()).toContain("この保存で新しく登録");
    expect(saveButton().textContent?.trim()).toBe("残りの3帳票を保存");

    await click(saveButton());
    expect(calls.filter((c) => c === "POST /api/clients")).toHaveLength(1);
    expect(savedPairs()).toEqual([
      "new-1:assessment",
      "new-1:carePlan",
      "new-1:meetingSummary", // 1回目は 503
      "new-1:meetingSummary",
      "new-1:supportLog",
      "new-1:monitoring",
    ]);
    expect(visibleText()).toContain("利用者に保存しました");
  });

  it("既にいる利用者を選んで2枚目が失敗しても、押し直しで保存済みの帳票を二重に保存しない", async () => {
    await renderResult();
    await typeInto("#save-client", "c1");
    failDocumentCalls = [2];

    await click(saveButton());
    expect(visibleText()).toContain(LOOKUP_FAILED);
    expect(visibleText()).toContain("A様");
    expect(saveButton().textContent?.trim()).toBe("残りの4帳票を保存");

    await click(saveButton());
    expect(calls.filter((c) => c === "POST /api/clients")).toHaveLength(0);
    expect(savedPairs()).toEqual([
      "c1:assessment",
      "c1:carePlan",
      "c1:carePlan",
      "c1:meetingSummary",
      "c1:supportLog",
      "c1:monitoring",
    ]);
  });

  it("保存した後に作り直した一式は「保存しました」と見せず、もう一度保存先を選ばせる", async () => {
    await renderResult();
    await typeInto("#save-client", "c1");
    await click(saveButton());
    expect(visibleText()).toContain("利用者に保存しました");

    await click(buttonByText("別の人物像で作り直す"));
    await typeInto("#f-personality", "別の方");
    await click(buttonByText("書類一式を生成する"));
    // 前の一式の「保存しました」を、まだ保存していない一式に出さない
    expect(container.innerHTML).not.toContain("利用者に保存しました");
    expect(container.querySelector("#save-client")).not.toBeNull();
    expect(saveButton().textContent?.trim()).toBe("この利用者に5帳票を保存");
  });
});

/** サーバが DB を読めなかったときの 503（app/api の入口が DbAccessError の publicMessage で返す形） */
const dbDown = (message: string) => () => json({ error: message }, 503);

describe("関係者名簿（利用者の画面・2026-09-24 検収の指摘）", () => {
  const RELATED_DOWN =
    "関係者名簿を読み込めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";

  async function renderRelated() {
    const { default: RelatedPeople } = await import("@/components/clients/RelatedPeople");
    await render(<RelatedPeople clientId="c1" clientCode="A" />);
  }

  it("一覧が 503 なら、読めなかったことを文字で出す（空の名簿に見せない）", async () => {
    routes["GET /api/clients/c1/related"] = [dbDown(RELATED_DOWN)];
    await renderRelated();
    const alert = elementsOf(container.innerHTML).find((e) => attrOf(e, "role") === "alert");
    expect(alert && textOf(alert)).toContain(RELATED_DOWN);
  });

  it("「もう一度読む」で読み直し、読めたら知らせが消えて名簿が出る", async () => {
    routes["GET /api/clients/c1/related"] = [
      dbDown(RELATED_DOWN),
      () =>
        json([{ id: "r1", clientId: "c1", relation: "長女", name: "山田春子", createdAt: "x" }]),
    ];
    await renderRelated();
    await click(buttonByText("もう一度読む"));
    expect(visibleText()).not.toContain(RELATED_DOWN);
    expect(visibleText()).toContain("山田春子");
  });

  it("0人で読めたときは知らせを出さない（失敗とは区別する）", async () => {
    routes["GET /api/clients/c1/related"] = [() => json([])];
    await renderRelated();
    expect(container.innerHTML).not.toContain("読み込めませんでした");
  });
});

describe("保存した文字起こし（利用者の画面・2026-09-24 検収の指摘）", () => {
  const LIST_DOWN =
    "保存した文字起こしの一覧を読み込めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";
  const DELETE_DOWN =
    "文字起こしを消せませんでした（消えていません）。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";
  const SUMMARY = {
    id: "t1",
    clientId: "c1",
    kind: "meeting",
    title: "9月の会議",
    chars: 5,
    createdAt: "2026-09-17T00:00:00Z",
    retentionUntil: "2031-09-17T00:00:00Z",
  };

  async function renderSaved() {
    const { default: SavedTranscripts } = await import("@/components/clients/SavedTranscripts");
    await render(<SavedTranscripts clientId="c1" />);
  }

  it("一覧が 503 なら、欄を消さずに読めなかったことを文字で出す（「無い」に見せない）", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [dbDown(LIST_DOWN)];
    await renderSaved();
    const alert = elementsOf(container.innerHTML).find((e) => attrOf(e, "role") === "alert");
    expect(alert && textOf(alert)).toContain(LIST_DOWN);
  });

  it("0件で読めたときは欄を出さない（上の検査が空振りしていない証拠）", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [() => json({ transcripts: [] })];
    await renderSaved();
    expect(container.innerHTML).toBe("");
  });

  it("消せなかったときは、サーバの文（消えていません）をそのまま出す", async () => {
    routes["GET /api/transcripts?clientId=c1"] = [() => json({ transcripts: [SUMMARY] })];
    routes["DELETE /api/transcripts/t1"] = [dbDown(DELETE_DOWN)];
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderSaved();
    await click(buttonByText("消す"));
    expect(visibleText()).toContain(DELETE_DOWN);
    confirmed.mockRestore();
  });
});

describe("ダッシュボードの評価の履歴（2026-09-24 検収の指摘）", () => {
  const HISTORY_DOWN =
    "評価の履歴を読み込めませんでした。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";

  async function renderDashboard() {
    const { default: DashboardPage } = await import("@/app/(dashboard)/dashboard/page");
    await render(<DashboardPage />);
  }

  it("履歴が 503 なら、読めなかったことを文字で出し、「まだ評価履歴がありません」も件数 0 も出さない", async () => {
    routes["GET /api/history"] = [dbDown(HISTORY_DOWN)];
    await renderDashboard();
    const alert = elementsOf(container.innerHTML).find((e) => attrOf(e, "role") === "alert");
    expect(alert && textOf(alert)).toContain(HISTORY_DOWN);
    // 隠して出しても「出ていない」と取り違えないよう、HTML 全体で見る
    expect(container.innerHTML).not.toContain("まだ評価履歴がありません");
    expect(visibleText()).toContain("総評価数—件");
  });

  it("0件で読めたときは「まだ評価履歴がありません」と件数 0 を出す（失敗とは区別する）", async () => {
    routes["GET /api/history"] = [() => json([])];
    await renderDashboard();
    expect(visibleText()).toContain("まだ評価履歴がありません");
    expect(visibleText()).toContain("総評価数0件");
    expect(container.innerHTML).not.toContain("読み込めませんでした");
  });
});

describe("利用者の一覧（/clients）", () => {
  /**
   * /clients を開いたときと同じ形で描く。A案（2026-09-24 A5）で一覧の表はページから layout
   * （components/clients/ClientsLayout.tsx ＋ ClientsContext.tsx）へ移ったので、layout にページの中身を入れて描く。
   * 確かめる中身（読めなかったら「まだ利用者がいません」を出さない）は取り込む前と同じ。
   */
  async function renderList() {
    const { default: ClientsLayout } = await import("@/components/clients/ClientsLayout");
    const { default: ClientsPage } = await import("@/app/(dashboard)/clients/page");
    const page = await ClientsPage({ searchParams: Promise.resolve({}) });
    await render(<ClientsLayout>{page}</ClientsLayout>);
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

describe("救済モードの一時保管の削除の警告（/rescue・2026-09-25 独立審査の指摘）", () => {
  const WARN =
    "資料の一時保管の削除に失敗しました。管理者に Vercel Blob の該当ファイルの削除を依頼してください。";

  /** 人物像を1つ書いて一式を作る（一覧は A様 だけ読める） */
  async function generate() {
    listResponses = [() => json([CLIENT_A])];
    const { default: RescuePage } = await import("@/app/(dashboard)/rescue/page");
    await render(<RescuePage />);
    const el = container.querySelector<HTMLTextAreaElement | HTMLInputElement>("#f-personality");
    if (!el) throw new Error("#f-personality が見つかりません");
    const setValue = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el) as object,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(el, "穏やかな方");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(buttonByText("書類一式を生成する"));
    if (!container.querySelector("#save-client")) throw new Error("結果の画面になっていません");
  }

  /** 画面に出ている警告の枠（role=alert）の文字 */
  const alertTexts = () =>
    elementsOf(`<div>${container.innerHTML}</div>`)
      .filter((e) => attrOf(e, "role") === "alert")
      .map((e) => textOf(e));

  it("作成が成功して削除だけ失敗したとき、結果の画面に警告が文字で出て、その枠が画面の中へ動かされる", async () => {
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    try {
      rescueExtra = { warnings: [WARN] };
      await generate();
      expect(alertTexts().some((t) => t.includes("一時保管の削除に失敗しました"))).toBe(true);
      // 生成ボタンは長い入力欄の一番下。結果に切り替わってもスクロールの位置が残るので、警告の枠へ動かす
      expect(scrolled.some((el) => el.getAttribute("role") === "alert")).toBe(true);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("作成が失敗したときは、入力の画面の、押したボタンとエラーのすぐ上に警告が出る（ページの上に出して見落とさせない）", async () => {
    rescueStatus = 503;
    rescueExtra = { error: "利用者の名簿を読み込めませんでした。", warnings: [WARN] };
    listResponses = [() => json([CLIENT_A])];
    const { default: RescuePage } = await import("@/app/(dashboard)/rescue/page");
    await render(<RescuePage />);
    const el = container.querySelector<HTMLTextAreaElement | HTMLInputElement>("#f-personality");
    if (!el) throw new Error("#f-personality が見つかりません");
    const setValue = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(el) as object,
      "value",
    )?.set;
    await act(async () => {
      setValue?.call(el, "穏やかな方");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = buttonByText("書類一式を生成する");
    await click(button);
    const alert = [...container.querySelectorAll('[role="alert"]')].find((a) =>
      a.textContent?.includes("一時保管の削除に失敗しました"),
    );
    if (!alert) throw new Error("警告が出ていません");
    // 入力欄のどれよりも後ろ（下）にあり、生成ボタンより前（上）にある
    const fields = [...container.querySelectorAll("textarea, input")];
    const last = fields[fields.length - 1];
    expect(last.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const nowButton = buttonByText("書類一式を生成する");
    expect(
      alert.compareDocumentPosition(nowButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("「別の人物像で作り直す」を押すと、前の警告は消える", async () => {
    rescueExtra = { warnings: [WARN] };
    await generate();
    await click(buttonByText("別の人物像で作り直す"));
    expect(alertTexts().some((t) => t.includes("一時保管の削除に失敗しました"))).toBe(false);
  });

  it("削除できたときは警告を出さない（上の検査が空振りしていない証拠）", async () => {
    await generate();
    expect(alertTexts().some((t) => t.includes("一時保管の削除に失敗しました"))).toBe(false);
  });
});
