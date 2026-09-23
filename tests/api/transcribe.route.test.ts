import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/transcribe の入口の検査（2026-09-17 新設）。
 *
 * なぜ必要か:
 *   このルートは**音声を建物の外（米国 OpenAI）へ出す唯一の経路**なのに、
 *   ルート層のテストが1本も無かった。録音機能を3帳票へ広げる前に、
 *   「ログインしていない人を通さない」「上限を超えた音声を外へ出さない」
 *   「回数の暴走を止める」が壊れていないことを固定する。
 *
 * 仕様: docs/specs/recording-pipeline.md R2。
 */

type Session = { userId: string | null; orgId: string | null };
const clerk = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<{ userId: string | null; orgId: string | null }>>(async () => ({
    userId: "u1",
    orgId: null,
  })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth }));

const { POST } = await import("@/app/api/transcribe/route");

/** 音声ファイルを1つだけ積んだ POST を作る。 */
function post(name: string, bytes: number) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }), name);
  return new NextRequest("http://localhost/api/transcribe", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  clerk.auth.mockResolvedValue({ userId: "u1", orgId: null } satisfies Session);
  process.env.OPENAI_API_KEY = "test-key";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ text: "本人から電話。" }), { status: 200 })),
  );
});

describe("/api/transcribe の入口", () => {
  it("ログインしていなければ 401（音声は外へ出さない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("鍵が無ければ 503（外へ送らず、管理者への案内を返す）", async () => {
    process.env.OPENAI_API_KEY = "";
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    expect((await res.json()).error).toContain("OPENAI_API_KEY");
  });

  it("対応していない形式は 400（外へ送らない）", async () => {
    const res = await POST(post("memo.txt", 1024));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("上限を超えた音声は 400（送ってから断られると音声が無駄に外へ出る）", async () => {
    const res = await POST(post("long.mp3", 5 * 1024 * 1024));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect((await res.json()).error).toContain("大きすぎます");
  });

  it("ファイルが無ければ 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/transcribe", { method: "POST", body: new FormData() }),
    );
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("問題がなければ文字を返す（音声は保存しない＝返すのは文字だけ）", async () => {
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "本人から電話。" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("外部サービスが断ったら、職員向けの日本語に言い換えて返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota", { status: 429 })),
    );
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toContain("混み合って");
  });

  it("回数が1時間の上限を超えたら 429 で止める（暴走を止める）", async () => {
    clerk.auth.mockResolvedValue({ userId: "runaway", orgId: null });
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await POST(post("call.mp3", 1024));
    if (!last) throw new Error("1回も応答が返っていない");
    expect(last.status).toBe(429);
    expect((await last.json()).error).toContain("上限");
    // 上限に達したあとは外部サービスを呼ばない（30回ぶんで打ち止め）
    expect((fetch as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(30);
  });

  it("回数は人ごとに数える（隣の職員が使えなくならない）", async () => {
    clerk.auth.mockResolvedValue({ userId: "heavy", orgId: null });
    for (let i = 0; i < 30; i++) await POST(post("call.mp3", 1024));
    clerk.auth.mockResolvedValue({ userId: "quiet", orgId: null });
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(200);
  });
});

/**
 * 2026-09-17 の独立審査 minor:
 *   回数を検証より前に数えていたため、外へ1度も送っていない要求（大きすぎる・形式違い）でも
 *   枠を消費していた。押し間違い30回で1時間ロックアウトされうる。
 */
describe("回数の数え方", () => {
  it("外へ送らなかった要求は回数に数えない（押し間違いで枠を使い切らない）", async () => {
    clerk.auth.mockResolvedValue({ userId: "mistake", orgId: null });
    for (let i = 0; i < 40; i++) await POST(post("memo.txt", 1024)); // 形式違いで弾かれる
    const res = await POST(post("call.mp3", 1024));
    expect(res.status).toBe(200);
  });

  it("上限のメッセージに、いつまで待てばよいかが書いてある", async () => {
    clerk.auth.mockResolvedValue({ userId: "over", orgId: null });
    let last: Response | undefined;
    for (let i = 0; i < 31; i++) last = await POST(post("call.mp3", 1024));
    const body = await last?.json();
    expect(body.error).toContain("1時間");
    expect(body.error).toContain("30回");
  });
});
