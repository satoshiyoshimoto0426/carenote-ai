import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「どの入口から入っても、名簿の範囲（DataScope）が最後まで届くか」を固定する（独立審査 2026-09-12）。
 *
 * なぜ必要か:
 *   範囲の作り方（lib/db/clients.ts の scopeExpr）はテスト済みでも、**ルートが orgId を渡し忘れる**と
 *   事業所の名簿が読まれず、同僚が登録した利用者の実名が黒塗りされないまま AI へ出る。
 *   範囲を使うルートは **12ファイル・17ハンドラ**（2026-09-24 に書類の日付の入口を足した。2026-09-23 の数え直しで
 *   11ファイル・16ハンドラ。以前の「9本」は数え違い）。
 *   1本落ちても他のテストは緑のままなので、ここでまとめて縛る。
 *   範囲を使うルートを足したら、ここにも足して上の数を直す（`grep -rl resolveScope app/api` で数える）。
 */

const SCOPE = { userId: "user_abc", orgId: "org_xyz" };

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => SCOPE),
}));

const db = vi.hoisted(() => ({
  getClientAliases: vi.fn(),
  getClients: vi.fn(),
  getClientById: vi.fn(),
  getRelatedPeople: vi.fn(),
  deleteRelatedPerson: vi.fn(),
  addRelatedPerson: vi.fn(),
  createClientRecord: vi.fn(),
}));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, ...db };
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

const documents = vi.hoisted(() => ({ saveDocument: vi.fn(), getLatestDocMeta: vi.fn() }));
vi.mock("@/lib/db/documents", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/documents")>();
  return { ...orig, ...documents };
});

const clerk = await import("@clerk/nextjs/server");
const { AliasLoadError } = await import("@/lib/db/clients");
const { GET: listClients, POST: createClient } = await import("@/app/api/clients/route");
const { GET: getClient } = await import("@/app/api/clients/[id]/route");
const {
  GET: listRelated,
  POST: addRelated,
  DELETE: deleteRelated,
} = await import("@/app/api/clients/[id]/related/route");
const { GET: aliases } = await import("@/app/api/clients/aliases/route");
const { POST: generate } = await import("@/app/api/generate/route");
const { POST: preview } = await import("@/app/api/preview/route");
const { POST: assessment } = await import("@/app/api/kaipoke/assessment/route");
const { POST: rescue } = await import("@/app/api/rescue/route");
const { POST: saveTranscript, GET: listTranscripts } = await import("@/app/api/transcripts/route");
const { GET: readTranscript, DELETE: deleteTranscript } = await import(
  "@/app/api/transcripts/[id]/route"
);
const { POST: saveDocument } = await import("@/app/api/documents/route");
const { GET: latestDocs } = await import("@/app/api/clients/latest-docs/route");

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "c1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks は呼び出し履歴だけを消す。実装（mockResolvedValue）は残るので、
  // 壊れた id を入れたテストの後始末として毎回まっとうな値へ戻す
  vi.mocked(clerk.auth).mockResolvedValue(
    SCOPE as unknown as Awaited<ReturnType<typeof clerk.auth>>,
  );
  // 名簿を使う入口は「読めなかった」で 503 に落とし、渡された範囲だけを見る
  db.getClientAliases.mockRejectedValue(new AliasLoadError("scope test"));
  db.getClients.mockResolvedValue([]);
  db.getClientById.mockResolvedValue(null);
  db.getRelatedPeople.mockResolvedValue([]);
  db.deleteRelatedPerson.mockResolvedValue("not_found");
  db.addRelatedPerson.mockResolvedValue({ ok: false, error: "x" });
  db.createClientRecord.mockResolvedValue(null);
  transcripts.saveTranscript.mockResolvedValue({ ok: false, reason: "client_not_visible" });
  transcripts.getTranscriptsByClient.mockResolvedValue([]);
  transcripts.getTranscriptText.mockResolvedValue(null);
  transcripts.deleteTranscript.mockResolvedValue(false);
  documents.saveDocument.mockResolvedValue(null);
  documents.getLatestDocMeta.mockResolvedValue([]);
});

describe("AI へ送る4つの入口は、事業所の範囲で名簿を読む", () => {
  const MEMO = { documentType: "supportLog", supportNotes: "面談の記録。" };

  it.each([
    ["/api/generate", () => generate(post("/api/generate", MEMO))],
    ["/api/preview", () => preview(post("/api/preview", MEMO))],
    [
      "/api/kaipoke/assessment",
      () => assessment(post("/api/kaipoke/assessment", { draft: { domains: [] } })),
    ],
    ["/api/rescue", () => rescue(post("/api/rescue", { clientInfo: "ひとこと" }))],
  ])("%s", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(503);
    expect(db.getClientAliases).toHaveBeenCalledWith(SCOPE);
  });
});

describe("ログイン情報が壊れていたら、どの入口も同じ形で止まる（500 の HTML を返さない）", () => {
  beforeEach(() => {
    // 絞り込み式を壊す形の id（本来ありえないが、来たら広げずに止める）
    vi.mocked(clerk.auth).mockResolvedValue({
      userId: "u1,or=(1.eq.1)",
      orgId: null,
    } as unknown as Awaited<ReturnType<typeof clerk.auth>>);
  });

  it.each([
    ["/api/generate", () => generate(post("/api/generate", { documentType: "supportLog" }))],
    ["/api/clients", () => listClients()],
    ["GET /api/clients/latest-docs", () => latestDocs()],
    ["/api/clients/[id]", () => getClient(new NextRequest("http://localhost/api/clients/c1"), ctx)],
    [
      "POST /api/documents",
      () =>
        saveDocument(
          post("/api/documents", { clientId: "c1", docType: "assessment", content: { a: 1 } }),
        ),
    ],
  ])("%s は 503 と JSON を返す", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toHaveProperty("error");
    // DB には触らない
    expect(db.getClientAliases).not.toHaveBeenCalled();
    expect(db.getClients).not.toHaveBeenCalled();
    expect(db.getClientById).not.toHaveBeenCalled();
    expect(documents.saveDocument).not.toHaveBeenCalled();
    expect(documents.getLatestDocMeta).not.toHaveBeenCalled();
  });
});

describe("名簿を見せる・書き換える入口も同じ範囲を使う", () => {
  it("GET /api/clients/aliases", async () => {
    const res = await aliases();
    expect(res.status).toBe(503);
    expect(db.getClientAliases).toHaveBeenCalledWith(SCOPE);
  });

  it("GET /api/clients", async () => {
    await listClients();
    expect(db.getClients).toHaveBeenCalledWith(SCOPE);
  });

  it("POST /api/clients", async () => {
    await createClient(post("/api/clients", { name: "テスト花子" }));
    expect(db.createClientRecord).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SCOPE.userId, orgId: SCOPE.orgId }),
    );
  });

  it("GET /api/clients/[id]", async () => {
    await getClient(new NextRequest("http://localhost/api/clients/c1"), ctx);
    expect(db.getClientById).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("GET /api/clients/[id]/related", async () => {
    await listRelated(new NextRequest("http://localhost/api/clients/c1/related"), ctx);
    expect(db.getRelatedPeople).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("POST /api/clients/[id]/related", async () => {
    await addRelated(
      post("/api/clients/c1/related", { relation: "長女", name: "テスト一郎" }),
      ctx,
    );
    expect(db.addRelatedPerson).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SCOPE.userId, orgId: SCOPE.orgId, clientId: "c1" }),
    );
  });

  it("DELETE /api/clients/[id]/related", async () => {
    await deleteRelated(
      new NextRequest("http://localhost/api/clients/c1/related?relatedId=r1", {
        method: "DELETE",
      }),
      ctx,
    );
    expect(db.deleteRelatedPerson).toHaveBeenCalledWith("r1", "c1", SCOPE);
  });
});

/**
 * 文字起こしの入口（2026-09-17 追加）。
 * ここは**黒塗りが効かない生の実名**を出し入れする経路なので、範囲を渡し忘れると
 * 他事業所の会議録が読めてしまう。上の入口と同じ見張りに入れる。
 */
describe("保存した文字起こしの入口も、同じ範囲を使う", () => {
  it("POST /api/transcripts", async () => {
    await saveTranscript(post("/api/transcripts", { clientId: "c1", kind: "meeting", text: "あ" }));
    expect(transcripts.saveTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ scope: SCOPE, userId: SCOPE.userId }),
    );
  });

  it("GET /api/transcripts", async () => {
    await listTranscripts(new NextRequest("http://localhost/api/transcripts?clientId=c1"));
    expect(transcripts.getTranscriptsByClient).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("GET /api/transcripts/[id]", async () => {
    await readTranscript(new NextRequest("http://localhost/api/transcripts/t1"), ctx);
    expect(transcripts.getTranscriptText).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("DELETE /api/transcripts/[id]", async () => {
    await deleteTranscript(new NextRequest("http://localhost/api/transcripts/t1"), ctx);
    expect(transcripts.deleteTranscript).toHaveBeenCalledWith("c1", SCOPE);
  });
});

/**
 * 書類を利用者に保存する入口（2026-09-23 追加・作り直し計画 S1）。
 * 以前は範囲を使わず、保存先の利用者が見えるかも確かめていなかった（他事業所の利用者に書類を紐づけられた）。
 * 見えるかどうかの判定を名簿と同じ getClientById に一本化したので、範囲がそこまで届くことを縛る。
 */
describe("書類を保存する入口も、同じ範囲で保存先の利用者を確かめる", () => {
  it("POST /api/documents", async () => {
    const res = await saveDocument(
      post("/api/documents", { clientId: "c1", docType: "assessment", content: { a: 1 } }),
    );
    expect(db.getClientById).toHaveBeenCalledWith("c1", SCOPE);
    // 見えない利用者（この偽物の既定は null）には保存しない
    expect(res.status).toBe(404);
    expect(documents.saveDocument).not.toHaveBeenCalled();
  });
});

/**
 * 利用者一覧の日付の列の入口（2026-09-24 追加・作り直し計画 U5）。
 * 利用者は名簿と同じ範囲（getClients）、書類はログイン中の職員が保存したもの（created_by）だけを読む。
 * 範囲を渡し忘れると、他事業所の利用者の書類の日付が一覧に出る。
 */
describe("書類の日付の入口も、同じ範囲の利用者だけを見る", () => {
  it("GET /api/clients/latest-docs", async () => {
    db.getClients.mockResolvedValue([
      {
        id: "c1",
        orgId: SCOPE.orgId,
        code: "A",
        attributes: {},
        createdBy: "user_other",
        createdAt: "2026-09-01T00:00:00+00:00",
        updatedAt: "2026-09-01T00:00:00+00:00",
      },
    ]);
    const res = await latestDocs();
    expect(res.status).toBe(200);
    expect(db.getClients).toHaveBeenCalledWith(SCOPE);
    expect(documents.getLatestDocMeta).toHaveBeenCalledWith(["c1"], SCOPE.userId);
  });
});
