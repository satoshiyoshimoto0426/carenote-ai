import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/evaluate の一時保管まわり（CI 審査 PR #11 Minor）:
 *  ①許可外ホストの URL は読みに行かず削除も呼ばない ②非公開ストアの読み取りに失敗したら削除して 400
 *  ③読めたら AI へ進む（AI 呼び出しは偽物）
 */
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "u1", orgId: null })),
}));
const blob = vi.hoisted(() => ({ del: vi.fn(), get: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: blob.del, get: blob.get }));
vi.mock("@/lib/db", () => ({ saveEvaluation: vi.fn(async () => undefined) }));

const { POST } = await import("@/app/api/evaluate/route");
const { EVALUATE_MODEL } = await import("@/lib/evaluate/model");

const PRIVATE_URL = "https://abc.private.blob.vercel-storage.com/evaluate/1.pdf";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  blob.del.mockResolvedValue(undefined);
  process.env.ANTHROPIC_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: JSON.stringify({ total_score: 0, criteria: [] }) }],
          }),
          { status: 200 },
        ),
    ),
  );
});

describe("POST /api/evaluate（一時保管の扱い）", () => {
  it("許可外ホストの URL は読まず、削除も呼ばず 400", async () => {
    const res = await POST(post({ blobUrl: "https://evil.example.com/a.pdf", fileName: "a.pdf" }));
    expect(res.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
    expect(blob.del).not.toHaveBeenCalled();
  });

  it("非公開ストアの読み取りに失敗したら一時保管を削除して 400", async () => {
    blob.get.mockResolvedValue(null);
    const res = await POST(post({ blobUrl: PRIVATE_URL, fileName: "a.pdf" }));
    expect(res.status).toBe(400);
    expect(blob.get).toHaveBeenCalledWith(PRIVATE_URL, { access: "private" });
    expect(blob.del).toHaveBeenCalledWith(PRIVATE_URL);
  });

  it("読めたら認証つき get() の中身で先へ進み（入口の 400 にならない）、処理後に削除する", async () => {
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      blob: { contentType: "application/pdf" },
    });
    const res = await POST(post({ blobUrl: PRIVATE_URL, fileName: "a.pdf" }));
    // AI の返事の解釈は本テストの対象外（偽の返事なので 200 とは限らない）。入口で止まっていないことだけ見る
    expect(res.status).not.toBe(400);
    expect(blob.get).toHaveBeenCalledWith(PRIVATE_URL, { access: "private" });
    expect(blob.del).toHaveBeenCalledWith(PRIVATE_URL);
  });
});

/**
 * 点検のモデル名（Issue #4・2026-09-25）:
 *   本番は 2026-09-14 から、存在しない名前 `claude-sonnet-4-5-20250514` を送って API に弾かれ続けていた。
 *   日付つきの名前は手で書くと間違えるので、公式一覧の「別名（日付なし）」だけを送る、と固定する。
 */
describe("POST /api/evaluate（AI に送るモデル名）", () => {
  it("公式の別名（日付なし）を送る。日付つきの名前は手で書かない", async () => {
    expect(EVALUATE_MODEL).toMatch(/^claude-[a-z]+-\d+(-\d+)?$/);
    expect(EVALUATE_MODEL).not.toMatch(/\d{8}$/);
  });

  it("実際の呼び出しの本文でも、その名前をそのまま使う", async () => {
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      blob: { contentType: "application/pdf" },
    });
    await POST(post({ blobUrl: PRIVATE_URL, fileName: "a.pdf" }));
    const calls = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const ai = calls.find(([url]) => String(url).includes("api.anthropic.com"));
    if (!ai) throw new Error("AI の呼び出しが無い");
    const sent = JSON.parse(String(ai[1].body)) as { model: string };
    expect(sent.model).toBe(EVALUATE_MODEL);
  });
});
