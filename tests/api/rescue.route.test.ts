import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/rescue のルート層テスト（独立審査 2026-09-11 critical #5・D7/D20/D27）。
 *  ①許可外の URL は 400 ②資料の読み取り結果とファイル名が黒塗りされてから下流へ行く
 *  ③400/422 でも一時保管（Blob）を削除する ④削除失敗は warnings で画面に伝える
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "u1", orgId: null })),
}));
const db = vi.hoisted(() => ({ getClientAliases: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, getClientAliases: db.getClientAliases };
});
const blob = vi.hoisted(() => ({ del: vi.fn(), get: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: blob.del, get: blob.get }));
const ai = vi.hoisted(() => ({ generateIntake: vi.fn(), generateRescueBundle: vi.fn() }));
vi.mock("@/lib/generation/rescueIntake", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/rescueIntake")>();
  return { ...orig, generateIntake: ai.generateIntake };
});
vi.mock("@/lib/generation/rescue", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/rescue")>();
  return { ...orig, generateRescueBundle: ai.generateRescueBundle };
});

const { POST } = await import("@/app/api/rescue/route");

const BLOB_URL = "https://abc.private.blob.vercel-storage.com/intake/1.pdf";

function post(body: unknown) {
  return new NextRequest("http://localhost/api/rescue", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const EMPTY_INTAKE = {
  summary: "",
  cautions: [],
  facts: [],
  conflicts: [],
  documents: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "A様" }]);
  blob.del.mockResolvedValue(undefined);
  // 非公開ストアの読み取り（get）を偽物にする。fetch は呼ばれてはいけない
  blob.get.mockResolvedValue({
    statusCode: 200,
    stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
    blob: { contentType: "application/pdf" },
  });
  ai.generateRescueBundle.mockResolvedValue({ assessment: { overview: "A様 〔電話番号1〕" } });
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/rescue", () => {
  it("許可外ホストの資料 URL は 400（SSRF 対策）で、何も取りに行かない", async () => {
    const res = await POST(
      post({
        personality: "穏やか",
        sourceDocs: [{ name: "a.pdf", url: "https://evil.example.com/a.pdf" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
    expect(ai.generateIntake).not.toHaveBeenCalled();
  });

  it("公開ストアの URL も受け付けない（D6: 非公開ストアのみ）", async () => {
    const res = await POST(
      post({
        personality: "穏やか",
        sourceDocs: [{ name: "a.pdf", url: "https://abc.public.blob.vercel-storage.com/a.pdf" }],
      }),
    );
    expect(res.status).toBe(400);
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("実名が残る形なら 422 にし、アップロード済みの資料は削除する", async () => {
    db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "山田花子様" }]);
    const res = await POST(
      post({ personality: "山田花子さんは穏やか", sourceDocs: [{ name: "a.pdf", url: BLOB_URL }] }),
    );
    expect(res.status).toBe(422);
    expect(blob.del).toHaveBeenCalledWith([BLOB_URL]);
    expect(ai.generateIntake).not.toHaveBeenCalled();
  });

  it("資料のファイル名と読み取り結果を黒塗りしてから下流へ渡し、処理後に1回だけ削除する", async () => {
    ai.generateIntake.mockResolvedValue({
      ...EMPTY_INTAKE,
      summary: "山田花子 090-1234-5678 に連絡",
      facts: [
        { category: "健康状態", text: "血圧140/90", source: "山田花子_主治医意見書.pdf", date: "" },
      ],
      documents: [
        { name: "山田花子_主治医意見書.pdf", detectedType: "主治医意見書", readability: "良" },
      ],
    });
    const res = await POST(
      post({
        personality: "穏やか",
        sourceDocs: [{ name: "山田花子_主治医意見書.pdf", url: BLOB_URL, docType: "主治医意見書" }],
      }),
    );
    expect(res.status).toBe(200);
    // 読み取りは認証つき get()（fetch は使わない）
    expect(blob.get).toHaveBeenCalledWith(BLOB_URL, { access: "private" });
    expect(fetch).not.toHaveBeenCalled();
    const docs = ai.generateIntake.mock.calls[0][0] as { name: string }[];
    expect(docs[0].name).toBe("A様_主治医意見書.pdf");
    const [, intakeNotes] = ai.generateRescueBundle.mock.calls[0];
    expect(String(intakeNotes)).not.toMatch(/山田|1234/);
    expect(String(intakeNotes)).toContain("〔電話番号1〕");
    expect(blob.del).toHaveBeenCalledTimes(1);
    const json = await res.json();
    expect(json.intake.summary).toBe("A様 090-1234-5678 に連絡"); // 手元では戻る（二枚方式）
    expect(json.warnings).toBeUndefined();
  });

  it("削除に失敗しても黙らず warnings で画面へ伝える", async () => {
    blob.del.mockRejectedValue(new Error("blob down"));
    ai.generateIntake.mockResolvedValue(EMPTY_INTAKE);
    const res = await POST(
      post({ personality: "穏やか", sourceDocs: [{ name: "a.pdf", url: BLOB_URL }] }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.warnings).toHaveLength(1);
    expect(json.warnings[0]).toContain("削除に失敗");
  });

  it("人物像も資料も無ければ 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });
});
