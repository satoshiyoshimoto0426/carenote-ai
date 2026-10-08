import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// 黒塗りが呼ばれたかを見るため、本物を包んだ見張りにする（中身は本物のまま）
vi.mock("@/lib/privacy/maskBody", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/privacy/maskBody")>();
  return { ...orig, maskRequestBody: vi.fn(orig.maskRequestBody) };
});
const { maskRequestBody } = await import("@/lib/privacy/maskBody");

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

/**
 * ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open ── 2026-10-05 吉本さんの決定）。
 * 守ること: ①ログインしていない人に開くのは計画書づくり（supportPlanA）だけ ②名簿は読まない（試行版は名簿を持たない）が、
 *   番号などの型の黒塗りはそのまま通る ③AI の回数は1日30回で止まる（残高を使い切られて本番の AI まで止まらないため）
 *   ④AI を呼ぶ前に止まった頼みは回数に数えない ⑤印が無い今の本番では、ログインしていない人は今までどおり 401。
 */
describe("ログインなしの試行版（印 open）", () => {
  const PLAN = {
    documentType: "supportPlanA",
    interviewNotes: "K様より。困ったら 090-1234-5678 に電話してほしい。",
  };
  let ipSeq = 0;
  /** ログインしていない人の頼み（IP は毎回変える ── 同じ IP の1時間の上限に先に当たらないため） */
  async function asGuest(path: string, body: unknown, ip = `198.51.100.${++ipSeq % 250}`) {
    const { auth } = await import("@clerk/nextjs/server");
    vi.mocked(auth).mockResolvedValueOnce({ userId: null, orgId: null } as never);
    const req = post(path, body);
    req.headers.set("x-forwarded-for", ip);
    return req;
  }

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    ai.generateFromBody.mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("計画書づくりは、ログインしていなくても原案を返す（名簿は読まず、番号は黒塗りして送る）", async () => {
    const res = await generate(await asGuest("/api/generate", PLAN));
    expect(res.status).toBe(200);
    expect(db.getClientAliases).not.toHaveBeenCalled();
    const sent = ai.generateFromBody.mock.calls[0][0] as Record<string, unknown>;
    expect(String(sent.interviewNotes)).not.toContain("1234");
    expect(String(sent.interviewNotes)).toContain("〔電話番号1〕");
  });

  it("CareNote の書類は、試行版でもログインが要る（401・AI を呼ばない）", async () => {
    const res = await generate(await asGuest("/api/generate", MEMO));
    expect(res.status).toBe(401);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("印が無い今の本番では、計画書づくりでもログインが要る（401）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    const res = await generate(await asGuest("/api/generate", PLAN));
    expect(res.status).toBe(401);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("印が on（ログインが要る版）でも、ログインしていなければ 401", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    const res = await generate(await asGuest("/api/generate", PLAN));
    expect(res.status).toBe(401);
  });

  it("AI は1日30回で止める（31回目は 429・AI を呼ばない）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-01T03:00:00Z"));
    for (let i = 0; i < 30; i++) {
      expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(200);
    }
    const over = await generate(await asGuest("/api/generate", PLAN));
    expect(over.status).toBe(429);
    expect((await over.json()).error).toContain("30回");
    expect(ai.generateFromBody).toHaveBeenCalledTimes(30);
  });

  it("同じ IP アドレスからは1時間10回で止める", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-02T03:00:00Z"));
    for (let i = 0; i < 10; i++) {
      expect((await generate(await asGuest("/api/generate", PLAN, "203.0.113.9"))).status).toBe(
        200,
      );
    }
    expect((await generate(await asGuest("/api/generate", PLAN, "203.0.113.9"))).status).toBe(429);
    expect((await generate(await asGuest("/api/generate", PLAN, "203.0.113.10"))).status).toBe(200);
  });

  it("AI を呼ぶ前に止まった頼み（中身の誤り）は、1日の回数に数えない", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-03T03:00:00Z"));
    const { GenerateRequestError } = await import("@/lib/generation/dispatch");
    ai.generateFromBody.mockRejectedValueOnce(
      new GenerateRequestError(413, "入力が大きすぎます。"),
    );
    expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(413);
    for (let i = 0; i < 30; i++) {
      expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(200);
    }
  });

  it("送る前の確認も、計画書づくりならログインなしで返す（名簿は読まない・AI は呼ばない）", async () => {
    const res = await preview(await asGuest("/api/preview", PLAN));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fields.interviewNotes).toContain("〔電話番号1〕");
    expect(db.getClientAliases).not.toHaveBeenCalled();
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("AI を呼んだあとの失敗（500）は、1日の回数を戻さない（費用がかかっているため）", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-04T03:00:00Z"));
    ai.generateFromBody.mockRejectedValueOnce(new Error("AI の会社が落ちた"));
    expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(500);
    for (let i = 0; i < 29; i++) {
      expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(200);
    }
    expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(429);
  });

  it("黒塗りで止まった頼み（422）は、AI を呼ばず回数にも数えない", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-05T03:00:00Z"));
    // 13桁の数字の並びは型で消えず、漏れ検査で止まる（名簿の無いゲストでも止まる）
    const leak = { documentType: "supportPlanA", interviewNotes: "番号は1234567890123です。" };
    expect((await generate(await asGuest("/api/generate", leak))).status).toBe(422);
    for (let i = 0; i < 30; i++) {
      expect((await generate(await asGuest("/api/generate", PLAN))).status).toBe(200);
    }
    expect(ai.generateFromBody).toHaveBeenCalledTimes(30);
  });

  it("上限を超える長さの文は、黒塗りの前に 413 で断る（原案づくり・送る前の確認とも。独立審査 2026-10-08 重大1）", async () => {
    const huge = { documentType: "supportPlanA", interviewNotes: "a".repeat(200_000) };
    for (const [route, path] of [
      [generate, "/api/generate"],
      [preview, "/api/preview"],
    ] as const) {
      const started = performance.now();
      const res = await route(await asGuest(path, huge));
      expect(res.status).toBe(413);
      expect(performance.now() - started).toBeLessThan(2_000);
    }
    // 黒塗りの前で止めていること（型が速くなった今は、時間では見分けられない ── 再審査 中2(a)）
    expect(vi.mocked(maskRequestBody)).not.toHaveBeenCalled();
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("ゲストは使う欄（documentType・clientInfo・interviewNotes）だけが黒塗りと AI に渡る（欄の数で計算を使わせない）", async () => {
    const extra = { ...PLAN, clientInfo: "28歳", supportNotes: "別の欄", junk: "x" };
    expect((await generate(await asGuest("/api/generate", extra))).status).toBe(200);
    const sent = ai.generateFromBody.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(["clientInfo", "documentType", "interviewNotes"]);
    const res = await preview(await asGuest("/api/preview", extra));
    expect(Object.keys((await res.json()).fields).sort()).toEqual(["clientInfo", "interviewNotes"]);
  });

  it("欄が多すぎる頼み（51個以上）は、ログインしていても黒塗りの前に 413", async () => {
    const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, ""]));
    const res = await generate(post("/api/generate", { ...MEMO, ...many }));
    expect(res.status).toBe(413);
    expect(vi.mocked(maskRequestBody)).not.toHaveBeenCalled();
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("送る前の確認も、同じ IP からは1時間60回で止める（AI は呼ばないが、黒塗りの計算を何回でも使わせない）", async () => {
    for (let i = 0; i < 60; i++) {
      expect((await preview(await asGuest("/api/preview", PLAN, "203.0.113.77"))).status).toBe(200);
    }
    const over = await preview(await asGuest("/api/preview", PLAN, "203.0.113.77"));
    expect(over.status).toBe(429);
    expect((await preview(await asGuest("/api/preview", PLAN, "203.0.113.78"))).status).toBe(200);
  });

  it("別のサイトからの頼みは 403、JSON でない頼みは 415（別のサイトに来た人のブラウザを使わせない）", async () => {
    for (const [route, path] of [
      [generate, "/api/generate"],
      [preview, "/api/preview"],
    ] as const) {
      const cross = await asGuest(path, PLAN);
      cross.headers.set("origin", "https://evil.example");
      expect((await route(cross)).status).toBe(403);
      const text = await asGuest(path, PLAN);
      text.headers.set("content-type", "text/plain");
      expect((await route(text)).status).toBe(415);
    }
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("本番の名前（carenote-ai.vercel.app）では、印が open でもログインが要る（401）", async () => {
    const { auth } = await import("@clerk/nextjs/server");
    for (const [route, path] of [
      [generate, "/api/generate"],
      [preview, "/api/preview"],
    ] as const) {
      vi.mocked(auth).mockResolvedValueOnce({ userId: null, orgId: null } as never);
      const req = new NextRequest(`https://carenote-ai.vercel.app${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(PLAN),
      });
      expect((await route(req)).status).toBe(401);
    }
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });

  it("送る前の確認も、CareNote の書類はログインが要る（401）", async () => {
    const res = await preview(await asGuest("/api/preview", MEMO));
    expect(res.status).toBe(401);
  });
});
