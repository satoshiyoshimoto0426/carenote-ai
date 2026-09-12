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
