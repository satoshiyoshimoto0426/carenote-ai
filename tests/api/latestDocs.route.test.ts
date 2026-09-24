import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 利用者一覧の日付の列の入口 GET /api/clients/latest-docs の答え方を固定する（作り直し計画 U5）。
 *
 * なぜ必要か:
 *   この入口が失敗を空の答え（{ clients: [] } や、書類の無い利用者）で返すと、画面は書類がある利用者の列を
 *   「—」（まだありません）と見せ、職員は保存した書類を作り直してしまう。範囲の外の利用者や、
 *   同僚が保存した書類の日付を返せば、見えてはいけないものが見える。
 *   401・503・500 は JSON の文で返し、成功のときだけ日付を返すことをここで縛る。
 *   範囲が lib/db まで届くことは tests/api/orgScope.route.test.ts、行の読み方は lib/db/documents.test.ts、
 *   日付のまとめ方は lib/documents/latest.test.ts が縛る。
 */

const clerk = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_abc", orgId: "org_xyz" }) as Record<string, unknown>),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth }));

const db = vi.hoisted(() => ({ getClients: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, ...db };
});

const documents = vi.hoisted(() => ({ getLatestDocMeta: vi.fn() }));
vi.mock("@/lib/db/documents", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/documents")>();
  return { ...orig, ...documents };
});

const { GET } = await import("@/app/api/clients/latest-docs/route");
const { SCOPE_ERROR_MESSAGE } = await import("@/lib/db/clients");
const { LATEST_DOCS_LOAD_FAILED_MESSAGE } = await import("@/lib/db/documents");
const { DbAccessError } = await import("@/lib/db/errors");

function client(id: string, code: string, createdAt: string) {
  return {
    id,
    orgId: "org_xyz",
    code,
    attributes: {},
    createdBy: "user_other",
    createdAt,
    updatedAt: createdAt,
  };
}

const A = client("c-a", "A", "2026-04-01T00:00:00+00:00");
const B = client("c-b", "B", "2026-05-01T00:00:00+00:00");

let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  clerk.auth.mockResolvedValue({ userId: "user_abc", orgId: "org_xyz" });
  db.getClients.mockResolvedValue([A, B]);
  documents.getLatestDocMeta.mockResolvedValue([]);
});

afterEach(() => {
  logged.mockRestore();
});

/** 失敗の答えが JSON の文だけで、日付（clients）を含まず、残させないこと。 */
async function expectFailure(res: Response, status: number, error: string) {
  expect(res.status).toBe(status);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(res.headers.get("cache-control")).toBe("no-store");
  const body = await res.json();
  expect(body).toEqual({ error });
  return body;
}

describe("GET /api/clients/latest-docs: 失敗は空の答えにせず、文で返す", () => {
  it("ログインしていなければ 401（DB に触らない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    await expectFailure(await GET(), 401, "ログインが必要です。");
    expect(db.getClients).not.toHaveBeenCalled();
    expect(documents.getLatestDocMeta).not.toHaveBeenCalled();
  });

  it.each([
    ["userId", { userId: "u1,or=(1.eq.1)", orgId: null }],
    ["orgId", { userId: "user_abc", orgId: "org_1,or=(1.eq.1)" }],
  ])("範囲を決められなければ 503（%s が壊れた形・DB に触らない）", async (_name, who) => {
    clerk.auth.mockResolvedValue(who);
    await expectFailure(await GET(), 503, SCOPE_ERROR_MESSAGE);
    expect(db.getClients).not.toHaveBeenCalled();
    expect(documents.getLatestDocMeta).not.toHaveBeenCalled();
  });

  it("書類の行を DB から読めなければ 503 と職員向けの文（DB の詳しい理由は出さない）", async () => {
    documents.getLatestDocMeta.mockRejectedValue(
      new DbAccessError(
        "getLatestDocMeta: 08006 connection failure",
        LATEST_DOCS_LOAD_FAILED_MESSAGE,
      ),
    );
    const body = await expectFailure(await GET(), 503, LATEST_DOCS_LOAD_FAILED_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("08006");
  });

  it("利用者一覧を読めなければ 500 と職員向けの文（書類は読みに行かない・理由はログだけ）", async () => {
    db.getClients.mockRejectedValue(new Error("getClients: JWT issued at future"));
    const res = await GET();
    const body = await expectFailure(res, 500, LATEST_DOCS_LOAD_FAILED_MESSAGE);
    expect(JSON.stringify(body)).not.toContain("JWT");
    expect(documents.getLatestDocMeta).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      "[api/clients/latest-docs] GET failed:",
      "getClients: JWT issued at future",
    );
  });

  it("DB の失敗でない例外は 503（待てば直る）に丸めず 500", async () => {
    documents.getLatestDocMeta.mockRejectedValue(new TypeError("bug"));
    await expectFailure(await GET(), 500, LATEST_DOCS_LOAD_FAILED_MESSAGE);
  });

  it("日時を読めない行があれば 500（黙って飛ばして「まだありません」に見せない）", async () => {
    documents.getLatestDocMeta.mockResolvedValue([
      { clientId: A.id, docType: "assessment", status: "draft", createdAt: "not a date" },
    ]);
    await expectFailure(await GET(), 500, LATEST_DOCS_LOAD_FAILED_MESSAGE);
  });
});

describe("GET /api/clients/latest-docs: 読めたとき", () => {
  it("範囲内の利用者ごとに、種類ごとの最新（下書きも数える）と「更新」を返す（残させない）", async () => {
    documents.getLatestDocMeta.mockResolvedValue([
      {
        clientId: A.id,
        docType: "assessment",
        status: "approved",
        createdAt: "2026-06-01T00:00:00+00:00",
      },
      {
        clientId: A.id,
        docType: "assessment",
        status: "draft",
        createdAt: "2026-09-20T00:00:00+00:00",
      },
      {
        clientId: A.id,
        docType: "carePlan",
        status: "approved",
        createdAt: "2026-07-01T00:00:00+00:00",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      clients: [
        {
          clientId: A.id,
          latest: {
            assessment: { createdAt: "2026-09-20T00:00:00+00:00", status: "draft" },
            carePlan: { createdAt: "2026-07-01T00:00:00+00:00", status: "approved" },
          },
          updatedAt: "2026-09-20T00:00:00+00:00",
        },
        // 書類が無くても利用者は出る（「更新」は登録した日）
        { clientId: B.id, latest: {}, updatedAt: B.createdAt },
      ],
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("書類は、範囲内の利用者の id と、ログイン中の職員（created_by）で読む", async () => {
    await GET();
    expect(db.getClients).toHaveBeenCalledWith({ userId: "user_abc", orgId: "org_xyz" });
    expect(documents.getLatestDocMeta).toHaveBeenCalledWith([A.id, B.id], "user_abc");
  });

  it("範囲の外の利用者の行が紛れても返さない", async () => {
    documents.getLatestDocMeta.mockResolvedValue([
      {
        clientId: "c-outside",
        docType: "assessment",
        status: "draft",
        createdAt: "2026-09-23T00:00:00+00:00",
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(JSON.stringify(await res.json())).not.toContain("c-outside");
  });

  it("利用者が0人なら 200 と空の一覧（失敗とは区別できる）", async () => {
    db.getClients.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ clients: [] });
  });
});
