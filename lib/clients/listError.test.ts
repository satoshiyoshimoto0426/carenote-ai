import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLIENT_LIST_ERROR_HEADLINE,
  CLIENT_LIST_LOAD_FAILED_MESSAGE,
  clientListErrorMessage,
  fetchClientList,
} from "./listError";

/**
 * 利用者一覧の読み出しが「0人」と「読めなかった」を取り違えないことを固定する
 * （2026-09-23 作り直し計画 U0）。画面側の見え方は tests/ui/clientListErrors.live.test.tsx。
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** fetch を偽物にし、/api/clients 以外を呼んだら落とす */
function stubFetch(respond: () => Promise<Response>) {
  const fake = vi.fn(async (url: string) => {
    if (url !== "/api/clients") throw new Error(`想定外の呼び出し: ${url}`);
    return respond();
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("clientListErrorMessage: 先頭は必ず「利用者一覧を読めませんでした」", () => {
  it("API の文が無ければ、決まった文言", () => {
    expect(clientListErrorMessage(undefined)).toBe(CLIENT_LIST_LOAD_FAILED_MESSAGE);
    expect(clientListErrorMessage("  ")).toBe(CLIENT_LIST_LOAD_FAILED_MESSAGE);
    expect(clientListErrorMessage(42)).toBe(CLIENT_LIST_LOAD_FAILED_MESSAGE);
  });

  it("一覧 API の 500 の文言は二重にしない", () => {
    expect(clientListErrorMessage(CLIENT_LIST_LOAD_FAILED_MESSAGE)).toBe(
      CLIENT_LIST_LOAD_FAILED_MESSAGE,
    );
  });

  it("ログイン切れなど別の文は、見出しの後ろにそのまま残す（直し方の案内を消さない）", () => {
    expect(clientListErrorMessage("ログインが必要です。")).toBe(
      `${CLIENT_LIST_ERROR_HEADLINE}。ログインが必要です。`,
    );
  });
});

describe("fetchClientList: 失敗を空の一覧にしない", () => {
  it("200 の配列は一覧（0人も一覧のまま）", async () => {
    stubFetch(async () => json([], 200));
    expect(await fetchClientList()).toEqual({ ok: true, clients: [] });
    const record = { id: "c1", code: "A" };
    stubFetch(async () => json([record], 200));
    expect(await fetchClientList()).toEqual({ ok: true, clients: [record] });
  });

  it("500 は読めなかった（API の文言をそのまま出す）", async () => {
    stubFetch(async () => json({ error: CLIENT_LIST_LOAD_FAILED_MESSAGE }, 500));
    expect(await fetchClientList()).toEqual({
      ok: false,
      message: CLIENT_LIST_LOAD_FAILED_MESSAGE,
    });
  });

  it("503（ログイン情報の異常）も読めなかった。見出しを前に付ける", async () => {
    stubFetch(async () => json({ error: "ログイン情報を確認できなかったため中止しました。" }, 503));
    expect(await fetchClientList()).toEqual({
      ok: false,
      message: `${CLIENT_LIST_ERROR_HEADLINE}。ログイン情報を確認できなかったため中止しました。`,
    });
  });

  it("本文が JSON でない 500（HTML のエラー画面）も読めなかった", async () => {
    stubFetch(async () => new Response("<html>error</html>", { status: 500 }));
    expect(await fetchClientList()).toEqual({
      ok: false,
      message: CLIENT_LIST_LOAD_FAILED_MESSAGE,
    });
  });

  it("200 でも配列でない（ログイン画面の HTML・オブジェクト）なら読めなかった", async () => {
    stubFetch(async () => new Response("<html>sign-in</html>", { status: 200 }));
    expect((await fetchClientList()).ok).toBe(false);
    stubFetch(async () => json({ clients: [] }, 200));
    expect((await fetchClientList()).ok).toBe(false);
  });

  it("通信そのものが失敗しても例外を投げず、読めなかったにする", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await fetchClientList()).toEqual({
      ok: false,
      message: CLIENT_LIST_LOAD_FAILED_MESSAGE,
    });
  });
});
