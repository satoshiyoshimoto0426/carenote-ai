import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 一時保管の削除（2026-09-25）: 失敗を握りつぶさず、画面に出す警告の文を返すこと。
 * 点検（app/api/evaluate）と救済モード（app/api/rescue）が、返事を作る前にこれを待つ。
 */
const blob = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock("@vercel/blob", () => ({ del: blob.del }));

const { deleteTempBlobs, TEMP_DELETE_DEADLINE_MS, TEMP_DELETE_FAILED_WARNING } = await import(
  "./deleteTemp"
);

const URL1 = "https://abc.private.blob.vercel-storage.com/evaluate/1.pdf";
/** 削除は必ず「途中で止める指定」つきで呼ぶ（時間切れで SDK のやり直しを止めるため・lib/blob/deleteTemp.ts） */
const DEL_OPTS = expect.objectContaining({ abortSignal: expect.any(AbortSignal) });

beforeEach(() => {
  vi.clearAllMocks();
  blob.del.mockResolvedValue(undefined);
});

describe("deleteTempBlobs", () => {
  it("消せたら警告は無い（空の配列）", async () => {
    expect(await deleteTempBlobs(URL1, "evaluate")).toEqual([]);
    expect(blob.del).toHaveBeenCalledWith(URL1, DEL_OPTS);
  });

  it("消せなかったら、画面に出す警告の文を1つ返し、サーバーの記録にも残す", async () => {
    blob.del.mockRejectedValueOnce(new Error("blob down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deleteTempBlobs([URL1], "rescue")).toEqual([TEMP_DELETE_FAILED_WARNING]);
      expect(spy).toHaveBeenCalledWith("[rescue] blob delete:", "blob down");
    } finally {
      spy.mockRestore();
    }
  });

  // 2026-09-25 独立審査: SDK は障害時に最大10回やり直し、失敗を返すまで十数分かかりうる。待つと処理が時間切れになる
  it("削除が返ってこないときは、上限の時間で打ち切って警告を返し、残りのやり直しを止める", async () => {
    let signal: AbortSignal | undefined;
    blob.del.mockImplementationOnce((_urls: unknown, opts?: { abortSignal?: AbortSignal }) => {
      signal = opts?.abortSignal;
      return new Promise(() => {}); // いつまでも終わらない（SDK が障害でやり直し続けている）
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deleteTempBlobs(URL1, "evaluate", 30)).toEqual([TEMP_DELETE_FAILED_WARNING]);
      expect(signal?.aborted).toBe(true);
      expect(String(spy.mock.calls[0]?.[0])).toContain("時間切れ");
    } finally {
      spy.mockRestore();
    }
  });

  it("時間切れの後で削除が遅れて失敗しても、処理ごと落ちない", async () => {
    blob.del.mockImplementationOnce(
      () => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("late")), 40)),
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await deleteTempBlobs(URL1, "evaluate", 10)).toEqual([TEMP_DELETE_FAILED_WARNING]);
      // 遅れて来る失敗を待つ。受け手が無ければ vitest が「Unhandled Rejection」で実行ごと落とす
      await new Promise((resolve) => setTimeout(resolve, 80));
    } finally {
      spy.mockRestore();
    }
  });

  it("既定の上限は、点検（120秒）と救済モード（300秒）の持ち時間より十分短い", () => {
    expect(TEMP_DELETE_DEADLINE_MS).toBeLessThanOrEqual(10_000);
  });

  it("対象が無ければ削除を呼ばない", async () => {
    expect(await deleteTempBlobs([], "rescue")).toEqual([]);
    expect(await deleteTempBlobs("", "evaluate")).toEqual([]);
    expect(blob.del).not.toHaveBeenCalled();
  });
});
