import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 保存した文字起こしの入口の検査。
 *
 * ここに入るのは**黒塗りが効かない生の実名**（会議に出た全員）。
 * 「ログインしていない人を通さない」「他人の利用者のものを読めない」「消せる」を固定する。
 * 仕様: docs/specs/recording-pipeline.md R4。
 */

type Session = { userId: string | null; orgId: string | null };
const clerk = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null; orgId: string | null }>>(async () => ({
    userId: "u1",
    orgId: null,
  })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth }));

const db = vi.hoisted(() => ({
  saveTranscript: vi.fn(),
  getTranscriptsByClient: vi.fn(),
  getTranscriptText: vi.fn(),
  deleteTranscript: vi.fn(),
}));
vi.mock("@/lib/db/transcripts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/transcripts")>();
  return { ...orig, ...db };
});

const { TRANSCRIPT_TABLE_MISSING_MESSAGE, TranscriptTableMissingError } = await import(
  "@/lib/db/transcripts"
);
const { POST, GET } = await import("@/app/api/transcripts/route");
const { GET: GET_ONE, DELETE } = await import("@/app/api/transcripts/[id]/route");

const summary = {
  id: "t1",
  clientId: "c1",
  kind: "meeting" as const,
  title: "9月17日 担当者会議",
  chars: 12,
  createdAt: "2026-09-17T00:00:00Z",
  retentionUntil: "2031-09-17T00:00:00Z",
};

function post(body: unknown) {
  return new NextRequest("http://localhost/api/transcripts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const listReq = (query: string) =>
  new NextRequest(`http://localhost/api/transcripts${query}`, { method: "GET" });
const oneReq = () => new NextRequest("http://localhost/api/transcripts/t1", { method: "GET" });
const params = { params: Promise.resolve({ id: "t1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  clerk.auth.mockResolvedValue({ userId: "u1", orgId: null } satisfies Session);
  db.saveTranscript.mockResolvedValue({ ok: true, transcript: summary });
  db.getTranscriptsByClient.mockResolvedValue([summary]);
  db.getTranscriptText.mockResolvedValue({ summary, text: "宮本さんより報告。" });
  db.deleteTranscript.mockResolvedValue(true);
});

describe("保存: POST /api/transcripts", () => {
  it("ログインしていなければ 401（保存もしない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    const res = await POST(post({ clientId: "c1", kind: "meeting", text: "あ" }));
    expect(res.status).toBe(401);
    expect(db.saveTranscript).not.toHaveBeenCalled();
  });

  it("保存先の利用者が無ければ 400", async () => {
    const res = await POST(post({ kind: "meeting", text: "あ" }));
    expect(res.status).toBe(400);
    expect(db.saveTranscript).not.toHaveBeenCalled();
  });

  it("知らない種類は 400（画面の言うことを信用しない）", async () => {
    const res = await POST(post({ clientId: "c1", kind: "secret", text: "あ" }));
    expect(res.status).toBe(400);
    expect(db.saveTranscript).not.toHaveBeenCalled();
  });

  it("空の文字起こしは 400", async () => {
    const res = await POST(post({ clientId: "c1", kind: "meeting", text: "   " }));
    expect(res.status).toBe(400);
    expect(db.saveTranscript).not.toHaveBeenCalled();
  });

  it("見えない利用者への保存は 404（他人の利用者に紐づけられない）", async () => {
    db.saveTranscript.mockResolvedValue({ ok: false, reason: "client_not_visible" });
    const res = await POST(post({ clientId: "other", kind: "meeting", text: "あ" }));
    expect(res.status).toBe(404);
  });

  it("問題なければ保存して、概要だけ返す（本文は返さない）", async () => {
    const res = await POST(
      post({
        clientId: "c1",
        kind: "meeting",
        title: "9月17日 担当者会議",
        text: "宮本さんより報告。",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcript).toEqual(summary);
    expect(JSON.stringify(body)).not.toContain("宮本さんより報告。");
  });

  it("見出しの改行は落として保存する（一覧が崩れない）", async () => {
    await POST(post({ clientId: "c1", kind: "meeting", title: "9月17日\n会議", text: "あ" }));
    expect(db.saveTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ title: "9月17日 会議" }),
    );
  });

  it("保存の途中で失敗しても、本文をエラーに混ぜない", async () => {
    db.saveTranscript.mockRejectedValue(new Error("boom"));
    const res = await POST(post({ clientId: "c1", kind: "meeting", text: "宮本さんより報告。" }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("宮本さん");
  });
});

describe("一覧: GET /api/transcripts", () => {
  it("ログインしていなければ 401", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    expect((await GET(listReq("?clientId=c1"))).status).toBe(401);
  });

  it("利用者の指定が無ければ 400", async () => {
    expect((await GET(listReq(""))).status).toBe(400);
  });

  it("一覧には本文を含めない（一覧のたびに復号しない）", async () => {
    const res = await GET(listReq("?clientId=c1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transcripts).toEqual([summary]);
    expect(JSON.stringify(body)).not.toContain("text");
  });
});

describe("本文を読む: GET /api/transcripts/[id]", () => {
  it("ログインしていなければ 401（復号もしない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    const res = await GET_ONE(oneReq(), params);
    expect(res.status).toBe(401);
    expect(db.getTranscriptText).not.toHaveBeenCalled();
  });

  it("見えない利用者のものは 404", async () => {
    db.getTranscriptText.mockResolvedValue(null);
    expect((await GET_ONE(oneReq(), params)).status).toBe(404);
  });

  it("読めれば本文を返す", async () => {
    const res = await GET_ONE(oneReq(), params);
    expect(res.status).toBe(200);
    expect((await res.json()).text).toBe("宮本さんより報告。");
  });

  it("復号に失敗したら、本文を出さずに 500（握りつぶさない）", async () => {
    db.getTranscriptText.mockRejectedValue(
      new Error("Unsupported state or unable to authenticate"),
    );
    const res = await GET_ONE(oneReq(), params);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("管理者");
  });
});

describe("消す: DELETE /api/transcripts/[id]", () => {
  it("ログインしていなければ 401（消しもしない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    const res = await DELETE(oneReq(), params);
    expect(res.status).toBe(401);
    expect(db.deleteTranscript).not.toHaveBeenCalled();
  });

  it("見えない利用者のものは消せない（404）", async () => {
    db.deleteTranscript.mockResolvedValue(false);
    expect((await DELETE(oneReq(), params)).status).toBe(404);
  });

  it("消せたら消したと返す（請求に応じたことを言い切れるように）", async () => {
    const res = await DELETE(oneReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
  });
});

/**
 * 独立審査 2026-09-17 critical: 表が未作成のとき、職員には「権限がありません」と誤配され、
 * 真因（管理者が SQL を実行していない）がどこにも出なかった。職員には直せない種類の話なので、
 * 管理者がやることを名指しして伝える。
 */
describe("表が未作成のとき、真因を伝える", () => {
  it("保存は 503 で、管理者のやることを名指しする", async () => {
    db.saveTranscript.mockRejectedValue(new TranscriptTableMissingError("missing"));
    const res = await POST(post({ clientId: "c1", kind: "meeting", text: "あ" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe(TRANSCRIPT_TABLE_MISSING_MESSAGE);
    expect(body.error).toContain("supabase/client_transcripts.sql");
    expect(body.error).not.toContain("権限");
  });

  it("一覧も 503（「0件」に見せて保存できていないことを隠さない）", async () => {
    db.getTranscriptsByClient.mockRejectedValue(new TranscriptTableMissingError("missing"));
    const res = await GET(listReq("?clientId=c1"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("supabase/client_transcripts.sql");
  });

  it("本文を読むときも 503", async () => {
    db.getTranscriptText.mockRejectedValue(new TranscriptTableMissingError("missing"));
    const res = await GET_ONE(oneReq(), params);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("supabase/client_transcripts.sql");
  });

  it("消すときも 503", async () => {
    db.deleteTranscript.mockRejectedValue(new TranscriptTableMissingError("missing"));
    const res = await DELETE(oneReq(), params);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("supabase/client_transcripts.sql");
  });
});
