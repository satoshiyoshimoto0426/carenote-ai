import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/extension/generate: 名簿の無い拡張経路でも型置換＋漏れ検査を通す（独立審査 2026-09-11 D5/D25）。
 */
const ai = vi.hoisted(() => ({ generateFromBody: vi.fn() }));
vi.mock("@/lib/generation/dispatch", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/dispatch")>();
  return { ...orig, generateFromBody: ai.generateFromBody };
});

const TOKEN = "abcdefghijklmnopqrstuvwxyz";
process.env.CARENOTE_EXTENSION_TOKENS = `cm01:${TOKEN}`;

const { POST } = await import("@/app/api/extension/generate/route");

function post(body: unknown, token = TOKEN) {
  return new NextRequest("http://localhost/api/extension/generate", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/extension/generate", () => {
  it("トークンが違えば 401", async () => {
    const res = await POST(post({ assessmentNotes: "x" }, "wrong-token-wrong-token"));
    expect(res.status).toBe(401);
  });

  it("電話番号・住所は札にしてから AI へ渡し、返事で戻す", async () => {
    ai.generateFromBody.mockImplementation(async (body: Record<string, unknown>) => ({
      overview: `連絡先は ${/〔電話番号1〕/.exec(String(body.assessmentNotes))?.[0]}`,
    }));
    const res = await POST(
      post({
        documentType: "assessment",
        assessmentNotes: "緊急連絡先 090-1234-5678、住所 大阪府大阪市北区梅田1-2-3",
      }),
    );
    expect(res.status).toBe(200);
    const sent = ai.generateFromBody.mock.calls[0][0] as Record<string, unknown>;
    expect(String(sent.assessmentNotes)).not.toMatch(/1234|梅田/);
    expect(String(sent.assessmentNotes)).toContain("〔住所1〕");
    expect((await res.json()).overview).toBe("連絡先は 090-1234-5678");
  });

  it("置換しきれない番号（0落ち）が残れば 422 で AI を呼ばない", async () => {
    const res = await POST(
      post({ documentType: "assessment", assessmentNotes: "折り返し 90-1234-5678" }),
    );
    expect(res.status).toBe(422);
    expect(ai.generateFromBody).not.toHaveBeenCalled();
  });
});
