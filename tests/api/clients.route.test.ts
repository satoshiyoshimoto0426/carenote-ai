import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 利用者一覧 GET /api/clients が、DB を読めないときに空の一覧 [] を返さないことを固定する
 * （2026-09-23 作り直し計画 U0）。
 *
 * なぜ必要か:
 *   以前は DB の失敗で [] が返り、画面は「まだ利用者がいません」、救済モードの保存は
 *   「新しい利用者として保存」だけになって同じ方を二重に登録できた。
 *   500 と職員向けの文言で返せば、画面（lib/clients/listError.ts の fetchClientList）は
 *   「利用者一覧を読めませんでした」を出せる。範囲の渡し方は tests/api/orgScope.route.test.ts が縛る。
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_abc", orgId: "org_xyz" })),
}));

const db = vi.hoisted(() => ({ getClients: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, ...db };
});

const { GET } = await import("@/app/api/clients/route");
const { CLIENT_LIST_ERROR_HEADLINE, CLIENT_LIST_LOAD_FAILED_MESSAGE } = await import(
  "@/lib/clients/listError"
);

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logged.mockRestore();
});

describe("GET /api/clients: DB を読めなければ 500 と職員向けの文言", () => {
  it("getClients が例外なら 500・JSON・「利用者一覧を読めませんでした」で始まる文言", async () => {
    db.getClients.mockRejectedValue(new Error("getClients: JWT issued at future"));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe(CLIENT_LIST_LOAD_FAILED_MESSAGE);
    expect(body.error.startsWith(CLIENT_LIST_ERROR_HEADLINE)).toBe(true);
    // 空の一覧に見せない（配列を返さない）
    expect(Array.isArray(body)).toBe(false);
  });

  it("DB の詳しい理由は画面へ出さず、サーバのログにだけ残す", async () => {
    db.getClients.mockRejectedValue(new Error("getClients: JWT issued at future"));
    const res = await GET();
    const text = await res.text();
    expect(text).not.toContain("JWT");
    expect(logged).toHaveBeenCalledWith(
      "[api/clients] GET failed:",
      "getClients: JWT issued at future",
    );
  });

  it("読めたら 200 で一覧をそのまま返す（0人は [] ── 失敗とは区別できる）", async () => {
    db.getClients.mockResolvedValue([]);
    const empty = await GET();
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual([]);

    const record = {
      id: "c1",
      orgId: "org_xyz",
      code: "A",
      attributes: {},
      createdBy: "user_abc",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    };
    db.getClients.mockResolvedValue([record]);
    const full = await GET();
    expect(full.status).toBe(200);
    expect(await full.json()).toEqual([record]);
    expect(logged).not.toHaveBeenCalled();
  });
});
