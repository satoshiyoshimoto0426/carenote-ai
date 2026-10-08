import { describe, expect, it, vi } from "vitest";
import { NETWORK_ERROR, postJson } from "./request";

/**
 * 計画書の画面から API へ送る小さな関数。失敗の文は職員がそのまま読むので、どの失敗でも日本語で返す。
 * 本物の通信はしない（fetch の代役を渡す）。
 */

const respond = (body: string, status: number) => vi.fn(async () => new Response(body, { status }));

describe("API へ送る", () => {
  it("成功なら中身を返し、JSON で POST する", async () => {
    const f = respond(JSON.stringify({ fields: { a: "b" } }), 200);
    const got = await postJson("/api/preview", { documentType: "supportPlanA" }, f);
    expect(got).toEqual({ ok: true, data: { fields: { a: "b" } } });
    expect(f).toHaveBeenCalledWith("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentType: "supportPlanA" }),
    });
  });

  it("サーバーが返した日本語の失敗の文（422＝名前が残っていて送れない など）は、そのまま返す", async () => {
    const msg = "実名が残っているため送信を中止しました。";
    const got = await postJson("/api/generate", {}, respond(JSON.stringify({ error: msg }), 422));
    expect(got).toEqual({ ok: false, error: msg });
  });

  it("通信そのものが失敗したら、英語の理由（Failed to fetch）ではなく日本語で返す", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const got = await postJson("/api/generate", {}, f);
    expect(got).toEqual({ ok: false, error: NETWORK_ERROR });
  });

  it("JSON でない返事（Vercel の 413・504 など）も、英語の理由を出さずに日本語で返す", async () => {
    const tooLong = await postJson("/x", {}, respond("Request Entity Too Large", 413));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.error).toContain("長すぎて");
    const timeout = await postJson("/x", {}, respond("<html>timeout</html>", 504));
    if (!timeout.ok) expect(timeout.error).toContain("時間内に終わりませんでした");
    const other = await postJson("/x", {}, respond("<html></html>", 200));
    expect(other.ok).toBe(false);
    if (!other.ok) {
      expect(other.error).toContain("（200）");
      expect(other.error).not.toMatch(/Unexpected|JSON|token/);
    }
  });

  it("失敗なのにサーバーの文が無いとき（空・文字でない）は、番号つきの日本語を返す", async () => {
    for (const body of [{}, { error: "" }, { error: 42 }]) {
      const got = await postJson("/x", {}, respond(JSON.stringify(body), 500));
      expect(got).toEqual({
        ok: false,
        error: "エラーが発生しました（500）。もう一度押してください。",
      });
    }
  });
});
