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
const { TEMP_DELETE_FAILED_WARNING } = await import("@/lib/blob/deleteTemp");

const BLOB_URL = "https://abc.private.blob.vercel-storage.com/intake/1.pdf";
/** 削除は必ず「途中で止める指定」つきで呼ぶ（時間切れで SDK のやり直しを止めるため・lib/blob/deleteTemp.ts） */
const DEL_OPTS = expect.objectContaining({ abortSignal: expect.any(AbortSignal) });

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
    expect(blob.del).toHaveBeenCalledWith([BLOB_URL], DEL_OPTS);
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

  // 2026-09-25: 以前は失敗の返事を作った後の finally で消していたため、失敗の返事には警告が載らなかった
  it("生成が失敗した 500 でも、返事を作る前に消し、削除の失敗を warnings で画面へ伝える", async () => {
    blob.del.mockRejectedValue(new Error("blob down"));
    ai.generateIntake.mockResolvedValue(EMPTY_INTAKE);
    ai.generateRescueBundle.mockRejectedValue(new Error("AI down"));
    const res = await POST(
      post({ personality: "穏やか", sourceDocs: [{ name: "a.pdf", url: BLOB_URL }] }),
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("AI down");
    expect(json.warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
    expect(blob.del).toHaveBeenCalledTimes(1);
  });

  it("生成が失敗しても、削除できたなら warnings は付かない", async () => {
    ai.generateIntake.mockResolvedValue(EMPTY_INTAKE);
    ai.generateRescueBundle.mockRejectedValue(new Error("AI down"));
    const res = await POST(
      post({ personality: "穏やか", sourceDocs: [{ name: "a.pdf", url: BLOB_URL }] }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).warnings).toBeUndefined();
    expect(blob.del).toHaveBeenCalledTimes(1);
  });

  it("人物像も資料も無ければ 400", async () => {
    const res = await POST(post({}));
    expect(res.status).toBe(400);
  });

  // 2026-09-25 独立審査: 生成（最大300秒）の後に消していたので、時間切れで打ち切られると資料が残った
  it("資料は読み込んだ直後、AI へ送る前に消す", async () => {
    ai.generateIntake.mockResolvedValue(EMPTY_INTAKE);
    const res = await POST(
      post({ personality: "穏やか", sourceDocs: [{ name: "a.pdf", url: BLOB_URL }] }),
    );
    expect(res.status).toBe(200);
    expect(blob.del).toHaveBeenCalledTimes(1);
    expect(blob.del.mock.invocationCallOrder[0]).toBeLessThan(
      ai.generateIntake.mock.invocationCallOrder[0],
    );
  });

  // 2026-09-25 独立審査: 1件だけ種類が不正でも全体が 400 になり、正しく上げた他の資料が残っていた
  it("資料の指定が不正な 400 でも、非公開ストアのホストの資料だけは消す（よそのホストは消さない）", async () => {
    const res = await POST(
      post({
        personality: "穏やか",
        sourceDocs: [
          { name: "a.pdf", url: BLOB_URL },
          { name: "b.txt", url: "https://abc.private.blob.vercel-storage.com/intake/2.txt" },
          { name: "c.pdf", url: "https://evil.example.com/c.pdf" },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(blob.del).toHaveBeenCalledTimes(1);
    expect(blob.del).toHaveBeenCalledWith(
      [BLOB_URL, "https://abc.private.blob.vercel-storage.com/intake/2.txt"],
      DEL_OPTS,
    );
    expect(blob.get).not.toHaveBeenCalled();
  });

  const BLOB_URL2 = "https://abc.private.blob.vercel-storage.com/intake/2.pdf";
  const sized = (bytes: number) => ({
    statusCode: 200,
    stream: new Blob([new Uint8Array(bytes)]).stream(),
    blob: { contentType: "application/pdf" },
  });

  it("資料の合計が大きすぎる 413（読み込みの途中）でも、まだ読んでいない資料も含めて1回で全部消す", async () => {
    blob.get
      .mockResolvedValueOnce(sized(15 * 1024 * 1024))
      .mockResolvedValueOnce(sized(10 * 1024 * 1024));
    const res = await POST(
      post({
        personality: "穏やか",
        sourceDocs: [
          { name: "a.pdf", url: BLOB_URL },
          { name: "b.pdf", url: BLOB_URL2 },
        ],
      }),
    );
    expect(res.status).toBe(413);
    expect(blob.del).toHaveBeenCalledTimes(1);
    expect(blob.del).toHaveBeenCalledWith([BLOB_URL, BLOB_URL2], DEL_OPTS);
    expect(ai.generateIntake).not.toHaveBeenCalled();
  });

  it("2件目の読み込みに失敗した 500 でも、2件とも1回で消す", async () => {
    blob.get.mockResolvedValueOnce(sized(3)).mockResolvedValueOnce(null);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await POST(
        post({
          personality: "穏やか",
          sourceDocs: [
            { name: "a.pdf", url: BLOB_URL },
            { name: "b.pdf", url: BLOB_URL2 },
          ],
        }),
      );
      expect(res.status).toBe(500);
      expect(blob.del).toHaveBeenCalledTimes(1);
      expect(blob.del).toHaveBeenCalledWith([BLOB_URL, BLOB_URL2], DEL_OPTS);
    } finally {
      spy.mockRestore();
    }
  });
});
