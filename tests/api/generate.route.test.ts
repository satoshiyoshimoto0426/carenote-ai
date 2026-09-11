import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PiiLeakError } from "@/lib/privacy/leakCheck";

/**
 * /api/generate と /api/preview のルート層テスト（独立審査 2026-09-11 critical #4/#5）。
 * Clerk・名簿・AI 呼び出しを偽物にし、
 *  ①名簿が読めなければ 503 で送らない ②実名が残る形なら 422 で送らない
 *  ③AI に渡る本文に実名・番号が無い ④返事の札は戻るが予定（appointments）は戻さない、を固定する。
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "u1", orgId: null })),
}));

const db = vi.hoisted(() => ({ getClientAliases: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, getClientAliases: db.getClientAliases };
});

const ai = vi.hoisted(() => ({ generateFromBody: vi.fn() }));
vi.mock("@/lib/generation/dispatch", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/dispatch")>();
  return { ...orig, generateFromBody: ai.generateFromBody };
});

const { AliasLoadError } = await import("@/lib/db/clients");
const { POST: generate } = await import("@/app/api/generate/route");
const { POST: preview } = await import("@/app/api/preview/route");

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ALIASES = [{ real: "山田花子", code: "A様" }];
const MEMO = {
  documentType: "supportLog",
  supportNotes: "山田花子さんの長女より電話 090-1234-5678。9/12 14時に面談。",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getClientAliases.mockResolvedValue(ALIASES);
});

describe("POST /api/generate", () => {
  it("名簿が読めなければ 503 で AI を呼ばない（fail-closed）", async () => {
    db.getClientAliases.mockRejectedValue(new AliasLoadError("boom"));
    const res = await generate(post("/api/generate", MEMO));
    expect(res.status).toBe(503);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("実名が残る形なら 422 で AI を呼ばない", async () => {
    db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "山田花子様" }]);
    const res = await generate(post("/api/generate", MEMO));
    expect(res.status).toBe(422);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("AI に渡る本文に実名・番号が無く、返事の札は戻し、予定は札のまま", async () => {
    ai.generateFromBody.mockImplementation(async (body: Record<string, unknown>) => ({
      clientName: "A様",
      entries: [{ body: `折り返し先 ${/〔電話番号1〕/.exec(String(body.supportNotes))?.[0]}` }],
      appointments: [{ title: "A様 面談", note: "持参 〔電話番号1〕" }],
      itemsToConfirm: [],
    }));
    const res = await generate(post("/api/generate", MEMO));
    expect(res.status).toBe(200);
    const sent = ai.generateFromBody.mock.calls[0][0] as Record<string, unknown>;
    expect(JSON.stringify(sent)).not.toMatch(/山田|1234/);
    expect(sent.supportNotes).toContain("A様");
    expect(sent.supportNotes).toContain("〔電話番号1〕");
    const json = await res.json();
    expect(json.entries[0].body).toBe("折り返し先 090-1234-5678");
    expect(json.appointments[0].note).toBe("持参 〔電話番号1〕");
  });

  it("ログインしていなければ 401", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: null } as never);
    const res = await generate(post("/api/generate", MEMO));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/preview", () => {
  it("名簿が読めなければ 503（確認画面も出さない）", async () => {
    db.getClientAliases.mockRejectedValue(new AliasLoadError("boom"));
    const res = await preview(post("/api/preview", MEMO));
    expect(res.status).toBe(503);
  });

  it("黒塗り後の本文と件数を返し、AI は呼ばない", async () => {
    const res = await preview(post("/api/preview", MEMO));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fields.supportNotes).toContain("A様");
    expect(json.fields.supportNotes).not.toMatch(/山田|1234/);
    expect(json.findings.names).toBe(1);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("実名が残る形なら 422", async () => {
    db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "山田花子様" }]);
    const res = await preview(post("/api/preview", MEMO));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("中止") });
    expect(PiiLeakError).toBeDefined();
  });
});
