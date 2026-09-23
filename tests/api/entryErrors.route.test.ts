import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 入口が「壊れた本文」と「DB を読めなかった」に、嘘の答えを返さないことを、入口をまたいで固定する。
 *
 * なぜ必要か（2026-09-24 検収の指摘・作り直し計画 S1）:
 *   ① 本文が JSON の `null` だと `await req.json()` は null を返し、続く `body.clientId` などが TypeError になって、
 *      入口は JSON の無い 500 を返していた（書き込みや送信は無かった）。同じ書き方が 10 の入口にあった。
 *      いまは lib/requestBody.ts の readJsonObject を通し、オブジェクト以外は 400 で止める。
 *   ② 利用者1件を DB から読めなかったとき（lib/db/clients.ts の getClientById が ClientLookupError を投げる）、
 *      以前は「見えない」と同じ null になり、書類の保存や利用者ページは 404「利用者が見つかりません。」と答えていた。
 *      救済モードではその言葉を信じた職員が「新しい利用者として保存」を選び、同じ方を二重に登録し得た。
 *      いまは getClientById を使う入口すべてが 503 と CLIENT_LOOKUP_FAILED_MESSAGE を返す。
 *   ③ 書類の一覧・承認、文字起こしの一覧・本文・削除、関係者の一覧、評価の履歴も、DB の失敗を
 *      []・null・false（＝「ありません」「見つかりません」）で返していた（同じ日の検収の指摘）。いまは
 *      lib/db が DbAccessError（lib/db/errors.ts）を投げ、入口は 503 とその publicMessage を返す。
 *
 * 入口を足したら、本文を読むものは BODY_ROUTES に、getClientById を通るものは LOOKUP_ROUTES に、
 * lib/db のほかの読み書きを通るものは DB_FAILURE_ROUTES に足す。関数の側の見張りは lib/db/dbFailures.test.ts。
 */

const SCOPE = { userId: "user_abc", orgId: "org_xyz" };

const clerk = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_abc", orgId: "org_xyz" })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth }));

const db = vi.hoisted(() => ({
  getClientAliases: vi.fn(),
  getClientById: vi.fn(),
  createClientRecord: vi.fn(),
  getRelatedPeople: vi.fn(),
  addRelatedPerson: vi.fn(),
  deleteRelatedPerson: vi.fn(),
}));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, ...db };
});

const documents = vi.hoisted(() => ({
  saveDocument: vi.fn(),
  approveDocument: vi.fn(),
  unapproveDocument: vi.fn(),
  getDocumentsByClient: vi.fn(),
}));
vi.mock("@/lib/db/documents", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/documents")>();
  return { ...orig, ...documents };
});

const transcripts = vi.hoisted(() => ({
  saveTranscript: vi.fn(),
  getTranscriptsByClient: vi.fn(),
  getTranscriptText: vi.fn(),
  deleteTranscript: vi.fn(),
}));
vi.mock("@/lib/db/transcripts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/transcripts")>();
  return { ...orig, ...transcripts };
});

const evaluations = vi.hoisted(() => ({ getEvaluations: vi.fn(), saveEvaluation: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db")>();
  return { ...orig, ...evaluations };
});

const ai = vi.hoisted(() => ({ generateFromBody: vi.fn() }));
vi.mock("@/lib/generation/dispatch", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/dispatch")>();
  return { ...orig, generateFromBody: ai.generateFromBody };
});

const EXT_TOKEN = "abcdefghijklmnopqrstuvwxyz";
process.env.CARENOTE_EXTENSION_TOKENS = `cm01:${EXT_TOKEN}`;

const { CLIENT_LOOKUP_FAILED_MESSAGE, ClientLookupError } = await import("@/lib/db/clients");
const { DbAccessError } = await import("@/lib/db/errors");
const { GET: history } = await import("@/app/api/history/route");
const { REQUEST_PARSE_ERROR_MESSAGE } = await import("@/lib/requestBody");
const { POST: createClient } = await import("@/app/api/clients/route");
const { GET: getClient } = await import("@/app/api/clients/[id]/route");
const {
  GET: listRelated,
  POST: addRelated,
  DELETE: deleteRelated,
} = await import("@/app/api/clients/[id]/related/route");
const { POST: saveDocument } = await import("@/app/api/documents/route");
const { PATCH: patchDocument } = await import("@/app/api/documents/[id]/route");
const { POST: saveTranscript, GET: listTranscripts } = await import("@/app/api/transcripts/route");
const { GET: readTranscript, DELETE: deleteTranscript } = await import(
  "@/app/api/transcripts/[id]/route"
);
const { POST: generate } = await import("@/app/api/generate/route");
const { POST: preview } = await import("@/app/api/preview/route");
const { POST: assessment } = await import("@/app/api/kaipoke/assessment/route");
const { POST: rescue } = await import("@/app/api/rescue/route");
const { POST: extensionGenerate } = await import("@/app/api/extension/generate/route");

const ctx = { params: Promise.resolve({ id: "c1" }) };

/** 生の本文（JSON の文字列そのもの）で要求を作る。 */
function raw(path: string, body: string, method = "POST", headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}
const get = (path: string, method = "GET") =>
  new NextRequest(`http://localhost${path}`, { method });

/** 本文を読む入口と、本文が正しければ次に呼ばれるはずの処理。 */
const BODY_ROUTES: [string, (body: string) => Promise<Response>, () => unknown[]][] = [
  ["POST /api/clients", (b) => createClient(raw("/api/clients", b)), () => [db.createClientRecord]],
  [
    "POST /api/clients/[id]/related",
    (b) => addRelated(raw("/api/clients/c1/related", b), ctx),
    () => [db.addRelatedPerson],
  ],
  [
    "POST /api/documents",
    (b) => saveDocument(raw("/api/documents", b)),
    () => [db.getClientById, documents.saveDocument],
  ],
  [
    "PATCH /api/documents/[id]",
    (b) =>
      patchDocument(raw("/api/documents/d1", b, "PATCH"), {
        params: Promise.resolve({ id: "d1" }),
      }),
    () => [documents.approveDocument, documents.unapproveDocument],
  ],
  [
    "POST /api/transcripts",
    (b) => saveTranscript(raw("/api/transcripts", b)),
    () => [transcripts.saveTranscript],
  ],
  [
    "POST /api/generate",
    (b) => generate(raw("/api/generate", b)),
    () => [db.getClientAliases, ai.generateFromBody],
  ],
  ["POST /api/preview", (b) => preview(raw("/api/preview", b)), () => [db.getClientAliases]],
  [
    "POST /api/kaipoke/assessment",
    (b) => assessment(raw("/api/kaipoke/assessment", b)),
    () => [db.getClientAliases],
  ],
  ["POST /api/rescue", (b) => rescue(raw("/api/rescue", b)), () => [db.getClientAliases]],
  [
    "POST /api/extension/generate",
    (b) =>
      extensionGenerate(
        raw("/api/extension/generate", b, "POST", { authorization: `Bearer ${EXT_TOKEN}` }),
      ),
    () => [ai.generateFromBody],
  ],
];

const BAD_BODIES: [string, string][] = [
  ["JSON の null", "null"],
  ["配列", '[{"clientId":"c1"}]'],
  ["文字列", '"c1"'],
  ["数値", "42"],
];

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  clerk.auth.mockResolvedValue({ ...SCOPE });
  // 本文の検査を通り抜けてしまったときに、先で止まらず進む値にしておく（呼ばれたかどうかで漏れを見る）
  db.getClientAliases.mockResolvedValue([]);
  db.getClientById.mockResolvedValue(null);
  db.createClientRecord.mockResolvedValue(null);
  db.addRelatedPerson.mockResolvedValue({ ok: false, error: "x" });
  documents.approveDocument.mockResolvedValue(null);
  documents.unapproveDocument.mockResolvedValue(null);
  documents.saveDocument.mockResolvedValue(null);
  documents.getDocumentsByClient.mockResolvedValue([]);
  transcripts.saveTranscript.mockResolvedValue({ ok: false, reason: "client_not_visible" });
  ai.generateFromBody.mockResolvedValue({});
});

afterEach(() => {
  logged.mockRestore();
});

describe("本文がオブジェクトでなければ、どの入口も 400 と JSON（先の処理を呼ばない）", () => {
  for (const [route, call, downstream] of BODY_ROUTES) {
    it.each(BAD_BODIES)(`${route}: 本文が%s`, async (_name, body) => {
      const res = await call(body);
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain("application/json");
      await expect(res.json()).resolves.toEqual({ error: REQUEST_PARSE_ERROR_MESSAGE });
      for (const fn of downstream()) expect(fn).not.toHaveBeenCalled();
    });
  }
});

/** getClientById を通る入口と、その入口が利用者を読むときに呼ぶ関数（ここを「読めなかった」にする）。 */
const LOOKUP_ROUTES: [string, () => Promise<Response>, () => ReturnType<typeof vi.fn>][] = [
  ["GET /api/clients/[id]", () => getClient(get("/api/clients/c1"), ctx), () => db.getClientById],
  [
    "POST /api/documents",
    () =>
      saveDocument(
        raw(
          "/api/documents",
          JSON.stringify({ clientId: "c1", docType: "assessment", content: { a: 1 } }),
        ),
      ),
    () => db.getClientById,
  ],
  [
    "GET /api/clients/[id]/related",
    () => listRelated(get("/api/clients/c1/related"), ctx),
    () => db.getRelatedPeople,
  ],
  [
    "POST /api/clients/[id]/related",
    () =>
      addRelated(
        raw("/api/clients/c1/related", JSON.stringify({ relation: "長女", name: "テスト一郎" })),
        ctx,
      ),
    () => db.addRelatedPerson,
  ],
  [
    "DELETE /api/clients/[id]/related",
    () => deleteRelated(get("/api/clients/c1/related?relatedId=r1", "DELETE"), ctx),
    () => db.deleteRelatedPerson,
  ],
  [
    "POST /api/transcripts",
    () =>
      saveTranscript(
        raw("/api/transcripts", JSON.stringify({ clientId: "c1", kind: "meeting", text: "あ" })),
      ),
    () => transcripts.saveTranscript,
  ],
  [
    "GET /api/transcripts",
    () => listTranscripts(get("/api/transcripts?clientId=c1")),
    () => transcripts.getTranscriptsByClient,
  ],
  [
    "GET /api/transcripts/[id]",
    () => readTranscript(get("/api/transcripts/t1"), ctx),
    () => transcripts.getTranscriptText,
  ],
  [
    "DELETE /api/transcripts/[id]",
    () => deleteTranscript(get("/api/transcripts/t1", "DELETE"), ctx),
    () => transcripts.deleteTranscript,
  ],
];

describe("利用者を DB から読めなかったら、どの入口も 404 にせず 503 と職員向けの文言", () => {
  it.each(LOOKUP_ROUTES)("%s", async (_route, call, lookup) => {
    lookup().mockRejectedValue(new ClientLookupError("JWT issued at future"));
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: CLIENT_LOOKUP_FAILED_MESSAGE });
    // DB の詳しい理由は画面へ出さない（サーバのログにだけ残す）
    expect(JSON.stringify(body)).not.toContain("JWT");
    expect(documents.saveDocument).not.toHaveBeenCalled();
    expect(documents.getDocumentsByClient).not.toHaveBeenCalled();
  });

  it("職員向けの文言は「見つかりません」と言わず、待ってからやり直すことを伝える", () => {
    expect(CLIENT_LOOKUP_FAILED_MESSAGE).not.toContain("見つかりません");
    expect(CLIENT_LOOKUP_FAILED_MESSAGE).toContain("もう一度");
  });
});

/** lib/db のほかの読み書きを通る入口と、その入口が呼ぶ関数（ここを DbAccessError にする）。 */
const DB_FAILURE_ROUTES: [string, () => Promise<Response>, () => ReturnType<typeof vi.fn>][] = [
  [
    "GET /api/clients/[id]（書類の一覧）",
    () => getClient(get("/api/clients/c1"), ctx),
    () => documents.getDocumentsByClient,
  ],
  [
    "PATCH /api/documents/[id]（承認）",
    () =>
      patchDocument(raw("/api/documents/d1", JSON.stringify({ action: "approve" }), "PATCH"), {
        params: Promise.resolve({ id: "d1" }),
      }),
    () => documents.approveDocument,
  ],
  [
    "PATCH /api/documents/[id]（承認の取り消し）",
    () =>
      patchDocument(raw("/api/documents/d1", JSON.stringify({ action: "unapprove" }), "PATCH"), {
        params: Promise.resolve({ id: "d1" }),
      }),
    () => documents.unapproveDocument,
  ],
  [
    "GET /api/clients/[id]/related（関係者の表）",
    () => listRelated(get("/api/clients/c1/related"), ctx),
    () => db.getRelatedPeople,
  ],
  [
    "GET /api/transcripts（一覧）",
    () => listTranscripts(get("/api/transcripts?clientId=c1")),
    () => transcripts.getTranscriptsByClient,
  ],
  [
    "GET /api/transcripts/[id]（本文）",
    () => readTranscript(get("/api/transcripts/t1"), ctx),
    () => transcripts.getTranscriptText,
  ],
  [
    "DELETE /api/transcripts/[id]（削除）",
    () => deleteTranscript(get("/api/transcripts/t1", "DELETE"), ctx),
    () => transcripts.deleteTranscript,
  ],
  ["GET /api/history（評価の履歴）", () => history(), () => evaluations.getEvaluations],
];

describe("DB を読み書きできなかったら、どの入口も「ありません・見つかりません」と答えず 503 と職員向けの文", () => {
  const PUBLIC = "テスト用の文。少し待ってから、もう一度お試しください。";

  it.each(DB_FAILURE_ROUTES)("%s", async (_route, call, fn) => {
    db.getClientById.mockResolvedValue({ id: "c1", code: "A" });
    fn().mockRejectedValue(new DbAccessError("connection failure 08006", PUBLIC));
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: PUBLIC });
    // DB の詳しい理由は画面へ出さない（サーバのログにだけ残す）
    expect(JSON.stringify(body)).not.toContain("08006");
  });

  it("DB の失敗でない例外は 503 に丸めない（握りつぶさずに投げ直す）", async () => {
    db.getClientById.mockResolvedValue({ id: "c1", code: "A" });
    documents.getDocumentsByClient.mockRejectedValue(new TypeError("bug"));
    await expect(getClient(get("/api/clients/c1"), ctx)).rejects.toThrow("bug");
  });
});
