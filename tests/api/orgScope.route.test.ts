import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「どの入口から入っても、名簿の範囲（DataScope）が最後まで届くか」を固定する（独立審査 2026-09-12）。
 *
 * なぜ必要か:
 *   範囲の作り方（lib/db/clients.ts の scopeExpr）はテスト済みでも、**ルートが orgId を渡し忘れる**と
 *   事業所の名簿が読まれず、同僚が登録した利用者の実名が黒塗りされないまま AI へ出る。
 *   ルートは9本あり、1本落ちても他のテストは緑のままなので、ここでまとめて縛る。
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
  // 名簿を使う入口は「読めなかった」で 503 に落とし、渡された範囲だけを見る
  db.getClientAliases.mockRejectedValue(new AliasLoadError("scope test"));
  db.getClients.mockResolvedValue([]);
  db.getClientById.mockResolvedValue(null);
  db.getRelatedPeople.mockResolvedValue([]);
  db.deleteRelatedPerson.mockResolvedValue("not_found");
  db.addRelatedPerson.mockResolvedValue({ ok: false, error: "x" });
  db.createClientRecord.mockResolvedValue(null);
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
