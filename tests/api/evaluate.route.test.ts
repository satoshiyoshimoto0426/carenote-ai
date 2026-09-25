import { inspect } from "node:util";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { saveEvaluation as SaveEvaluation } from "@/lib/db";

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
const db = vi.hoisted(() => ({ saveEvaluation: vi.fn<typeof SaveEvaluation>(async () => null) }));
vi.mock("@/lib/db", () => ({ saveEvaluation: db.saveEvaluation }));

const { POST } = await import("@/app/api/evaluate/route");
const { EVALUATE_MODEL } = await import("@/lib/evaluate/model");
const { EVALUATION_STORED_FILE_NAME } = await import("@/lib/evaluate/storedFileName");
const { TEMP_DELETE_FAILED_WARNING } = await import("@/lib/blob/deleteTemp");

const PRIVATE_URL = "https://abc.private.blob.vercel-storage.com/evaluate/1.pdf";
/** 削除は必ず「途中で止める指定」つきで呼ぶ（時間切れで SDK のやり直しを止めるため・lib/blob/deleteTemp.ts） */
const DEL_OPTS = expect.objectContaining({ abortSignal: expect.any(AbortSignal) });

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
    expect(blob.del).toHaveBeenCalledWith(PRIVATE_URL, DEL_OPTS);
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
    expect(blob.del).toHaveBeenCalledWith(PRIVATE_URL, DEL_OPTS);
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

/**
 * 元のファイル名を残さない（Issue #10・2026-09-25）:
 *   以前は職員が選んだ PDF の名前（実名が入りうる）を履歴の表にそのまま保存し、点検の履歴に表示していた。
 *   サーバーは本文の fileName を読まず、決まった名前だけを保存する。AI への文とサーバーのログにも出さない。
 */
describe("POST /api/evaluate（元のファイル名を残さない）", () => {
  const REAL_NAME = "山田太郎";
  const readable = () => ({
    statusCode: 200,
    stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
    blob: { contentType: "application/pdf" },
  });
  const aiAnswer = () =>
    new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({ client_name: "A", total_score: 10, categories: [] }),
          },
        ],
      }),
      { status: 200 },
    );

  /**
   * console に出たものを、Error の message と stack まで文字にして集める。
   * JSON.stringify は Error を {} にしてしまい、中に実名があっても見逃す（2026-09-25 独立審査の指摘）ので使わない。
   */
  function captureConsole() {
    const logs: string[] = [];
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => {
        logs.push(a.map((x) => inspect(x, { depth: 6 })).join(" "));
      }),
    );
    return {
      text: () => logs.join("\n"),
      restore: () => {
        for (const s of spies) s.mockRestore();
      },
    };
  }

  it("実名入りのファイル名を送っても、保存・AI への文・応答のどこにも出さず、決まった名前で保存する", async () => {
    blob.get.mockResolvedValue(readable());
    vi.mocked(fetch).mockResolvedValueOnce(aiAnswer());
    const res = await POST(post({ blobUrl: PRIVATE_URL, fileName: `${REAL_NAME}_ケアプラン.pdf` }));
    expect(res.status).toBe(200);
    expect(db.saveEvaluation).toHaveBeenCalledTimes(1);
    expect(db.saveEvaluation.mock.calls[0][0].fileName).toBe(EVALUATION_STORED_FILE_NAME);
    expect(JSON.stringify(db.saveEvaluation.mock.calls)).not.toContain(REAL_NAME);
    const sentToAi = vi
      .mocked(fetch)
      .mock.calls.map(([, init]) => String(init?.body ?? ""))
      .join(" ");
    expect(sentToAi).not.toContain(REAL_NAME);
    expect(await res.text()).not.toContain(REAL_NAME);
  });

  it("保存と一時保管の削除に失敗してログが出るときも、ログと応答に元のファイル名を出さない", async () => {
    blob.get.mockResolvedValue(readable());
    vi.mocked(fetch).mockResolvedValueOnce(aiAnswer());
    db.saveEvaluation.mockRejectedValueOnce(new Error("db down"));
    blob.del.mockRejectedValueOnce(new Error("blob down"));
    const c = captureConsole();
    try {
      const res = await POST(
        post({ blobUrl: PRIVATE_URL, fileName: `${REAL_NAME}_ケアプラン.pdf` }),
      );
      expect(res.status).toBe(200);
      // 見張りが本当にログを見たことを先に確かめる（ログ0件を「何も無いので合格」にしない）。
      // 2つのログは応答を返した後に出るので待つ
      await vi.waitFor(() => {
        expect(c.text()).toContain("db down");
        expect(c.text()).toContain("blob down");
      });
      expect(c.text()).not.toContain(REAL_NAME);
      expect(await res.text()).not.toContain(REAL_NAME);
    } finally {
      c.restore();
    }
  });

  it("読み取りに失敗した 400 と、AI が失敗した 500 でも、応答とログに元のファイル名を出さない", async () => {
    const c = captureConsole();
    try {
      blob.get.mockResolvedValueOnce(null);
      const r400 = await POST(post({ blobUrl: PRIVATE_URL, fileName: `${REAL_NAME}.pdf` }));
      expect(r400.status).toBe(400);
      expect(await r400.text()).not.toContain(REAL_NAME);

      blob.get.mockResolvedValueOnce(readable());
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 500 }),
      );
      const r500 = await POST(post({ blobUrl: PRIVATE_URL, fileName: `${REAL_NAME}.pdf` }));
      expect(r500.status).toBe(500);
      expect(await r500.text()).not.toContain(REAL_NAME);

      expect(c.text()).not.toContain(REAL_NAME);
      expect(db.saveEvaluation).not.toHaveBeenCalled();
    } finally {
      c.restore();
    }
  });

  it("ファイル名が無くても、同じ決まった名前で保存する", async () => {
    blob.get.mockResolvedValue(readable());
    vi.mocked(fetch).mockResolvedValueOnce(aiAnswer());
    const res = await POST(post({ blobUrl: PRIVATE_URL }));
    expect(res.status).toBe(200);
    expect(db.saveEvaluation.mock.calls[0][0].fileName).toBe(EVALUATION_STORED_FILE_NAME);
  });

  it("決まった名前は「資料」（元の名前や拡張子を含まない）", () => {
    expect(EVALUATION_STORED_FILE_NAME).toBe("資料");
  });
});

/**
 * 一時保管の削除に失敗したら画面へ伝える（2026-09-25・データ取扱説明書の「削除に失敗した時は画面に警告」）:
 *   以前は削除を待たずに返事を返し、失敗はサーバーの記録にしか残らなかった。
 *   返事を作る前に削除を待ち、失敗したら成功の返事にも失敗の返事にも warnings を載せる。
 */
describe("POST /api/evaluate（一時保管の削除の失敗を画面へ伝える）", () => {
  const readable = () => ({
    statusCode: 200,
    stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
    blob: { contentType: "application/pdf" },
  });
  const aiAnswer = () =>
    new Response(
      JSON.stringify({
        content: [
          {
            type: "text",
            text: JSON.stringify({ client_name: "A", total_score: 10, categories: [] }),
          },
        ],
      }),
      { status: 200 },
    );
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("評価が成功しても、削除に失敗したら返事に warnings が付く（評価結果はそのまま）", async () => {
    const spy = quiet();
    try {
      blob.get.mockResolvedValue(readable());
      vi.mocked(fetch).mockResolvedValueOnce(aiAnswer());
      blob.del.mockRejectedValueOnce(new Error("blob down"));
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total_score).toBe(10);
      expect(json.warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
    } finally {
      spy.mockRestore();
    }
  });

  it("削除できたら warnings は付かない", async () => {
    blob.get.mockResolvedValue(readable());
    vi.mocked(fetch).mockResolvedValueOnce(aiAnswer());
    const res = await POST(post({ blobUrl: PRIVATE_URL }));
    expect((await res.json()).warnings).toBeUndefined();
    expect(blob.del).toHaveBeenCalledWith(PRIVATE_URL, DEL_OPTS);
  });

  it("読み取りに失敗した 400 でも、削除に失敗したら warnings が付く", async () => {
    const spy = quiet();
    try {
      blob.get.mockResolvedValue(null);
      blob.del.mockRejectedValueOnce(new Error("blob down"));
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(400);
      expect((await res.json()).warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
    } finally {
      spy.mockRestore();
    }
  });

  it("AI が失敗した返事（500）でも、削除に失敗したら warnings が付き、削除は1回だけ", async () => {
    const spy = quiet();
    try {
      blob.get.mockResolvedValue(readable());
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "overloaded" } }), { status: 500 }),
      );
      blob.del.mockRejectedValueOnce(new Error("blob down"));
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(500);
      expect((await res.json()).warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
      expect(blob.del).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("AI の呼び出しそのものが失敗した（通信の例外）ときも、返事を作る前に消して warnings を付ける", async () => {
    const spy = quiet();
    try {
      blob.get.mockResolvedValue(readable());
      vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
      blob.del.mockRejectedValueOnce(new Error("blob down"));
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(500);
      expect((await res.json()).warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
      expect(blob.del).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * 2026-09-25 独立審査（2回目）: 一時保管は PDF を読んだ直後・AI へ送る前に消す（すみやかに削除。
 * AI の待ち時間の途中で打ち切られても残らない）。鍵の設定の抜けでも残さない。
 */
describe("POST /api/evaluate（読んだらすぐ消す）", () => {
  const readable = () => ({
    statusCode: 200,
    stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
    blob: { contentType: "application/pdf" },
  });
  const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

  it("一時保管は AI へ送る前に消す（削除は1回だけ）", async () => {
    blob.get.mockResolvedValue(readable());
    const res = await POST(post({ blobUrl: PRIVATE_URL }));
    expect(res.status).not.toBe(400);
    expect(blob.del).toHaveBeenCalledTimes(1);
    const aiCall = vi.mocked(fetch).mock.invocationCallOrder[0];
    expect(aiCall).toBeDefined();
    expect(blob.del.mock.invocationCallOrder[0]).toBeLessThan(aiCall);
  });

  it("AI の返事が JSON でなく失敗しても、先の削除の失敗の警告は消えずに 500 の返事に載る", async () => {
    const spy = quiet();
    try {
      blob.get.mockResolvedValue(readable());
      blob.del.mockRejectedValueOnce(new Error("blob down"));
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("<html>not json</html>", { status: 200 }),
      );
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(500);
      expect((await res.json()).warnings).toEqual([TEMP_DELETE_FAILED_WARNING]);
      expect(blob.del).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("本番で鍵の設定が抜けていても、一時保管は消してから 500 を返す（AI は呼ばない）", async () => {
    blob.get.mockResolvedValue(readable());
    process.env.ANTHROPIC_API_KEY = "";
    const res = await POST(post({ blobUrl: PRIVATE_URL }));
    expect(res.status).toBe(500);
    expect(blob.del).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /api/evaluate（AI の返事に紛れた warnings を削除の警告として出さない）", () => {
  it("削除できたのに、AI の返事の一番上の warnings が画面へ渡らない（評価結果はそのまま）", async () => {
    blob.get.mockResolvedValue({
      statusCode: 200,
      stream: new Blob([new Uint8Array([1, 2, 3])]).stream(),
      blob: { contentType: "application/pdf" },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                client_name: "A",
                total_score: 12,
                categories: [],
                warnings: ["システムの警告: 管理者に連絡してください"],
              }),
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await POST(post({ blobUrl: PRIVATE_URL }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total_score).toBe(12);
      expect(json.warnings).toBeUndefined();
      expect(JSON.stringify(db.saveEvaluation.mock.calls)).not.toContain("システムの警告");
    } finally {
      spy.mockRestore();
    }
  });
});
