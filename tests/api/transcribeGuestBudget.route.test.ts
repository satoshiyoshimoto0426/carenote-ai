import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ログインなしの試行版の文字起こしで、1日の枠を「音声の大きさの合計」で数えていることを、道（/api/transcribe）を通して固定する。
 * なぜ別のファイルか: 本物の枠（約288MB）では試験で使い切れないので、枠の値だけを小さく差し替える必要がある。
 *   同じファイルの他の試験（1時間30回など）に影響させないため、ここに分けた。
 * 守ること: 数える量を「1回」に戻す（file.size を数えない）と、大きなファイルで枠の何倍も外へ送れる（独立審査 2026-10-08 再審査 中2(b)）。
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: null, orgId: null })),
}));
vi.mock("@/lib/supportPlan/guestAccess", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/supportPlan/guestAccess")>();
  return { ...orig, GUEST_TRANSCRIBE_DAILY_BYTES: 5_000 };
});

const { POST } = await import("@/app/api/transcribe/route");

function postFrom(ip: string, bytes: number) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), "call.mp3");
  const req = new NextRequest("http://localhost/api/transcribe", { method: "POST", body: form });
  req.headers.set("x-forwarded-for", ip);
  return req;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ゲストの文字起こしの1日の枠は、音声の大きさの合計で数える", () => {
  it("枠（ここでは5000バイト）を超える分は、回数が少なくても 429 で止め、外へ送らない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ text: "本人から電話。" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    // IP を毎回変える（同じ IP の1時間の上限ではなく、1日の枠で止まることを見る）
    expect((await POST(postFrom("198.51.100.1", 3_000))).status).toBe(200);
    const over = await POST(postFrom("198.51.100.2", 3_000)); // 合計 6000 > 5000
    expect(over.status).toBe(429);
    expect((await over.json()).error).toContain("約20時間分");
    expect((await POST(postFrom("198.51.100.3", 1_500))).status).toBe(200); // 合計 4500 ≦ 5000
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
