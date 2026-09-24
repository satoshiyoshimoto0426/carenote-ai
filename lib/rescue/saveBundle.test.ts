import { describe, expect, it } from "vitest";
import { type BundleSaveProgress, saveBundleDocuments } from "./saveBundle";

/**
 * 救済モードの一式保存を押し直しても、同じ方を二重に登録せず、保存済みの帳票も二重に保存しないことを固定する
 * （2026-09-24 検収の指摘）。以前は作った利用者の id を関数の中にしか持たず、途中の1枚が失敗して
 * 押し直すと、もう1人作って一式を最初から保存し直していた。画面を動かす検査は
 * tests/ui/clientListErrors.live.test.tsx にある。
 */

type Key = "assessment" | "carePlan" | "monitoring";
const KEYS: readonly Key[] = ["assessment", "carePlan", "monitoring"];
const BUNDLE: Record<Key, unknown> = {
  assessment: { a: 1 },
  carePlan: { b: 2 },
  monitoring: { c: 3 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** 偽の通信。documents の n 回目（1から数える）を失敗させられる。送った本文を残す。 */
function fakeFetch(opts: { failDocumentCalls?: number[]; failClient?: boolean } = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let documentCalls = 0;
  let clientCalls = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (url === "/api/clients") {
      clientCalls++;
      if (opts.failClient) return json({ error: "利用者を登録できませんでした。" }, 500);
      return json({ id: `new-${clientCalls}`, code: "B" }, 201);
    }
    if (url === "/api/documents") {
      documentCalls++;
      if (opts.failDocumentCalls?.includes(documentCalls)) {
        return json({ error: "利用者の情報を読み込めませんでした。" }, 503);
      }
      return json({ id: `d${documentCalls}` }, 201);
    }
    throw new Error(`想定外の通信: ${String(url)}`);
  }) as typeof fetch;
  return {
    impl,
    calls,
    clientPosts: () => calls.filter((c) => c.url === "/api/clients"),
    documentPosts: () => calls.filter((c) => c.url === "/api/documents"),
  };
}

/** 画面と同じ使い方: 途中経過を覚えておき、押し直しに渡す。 */
async function press(
  fetchImpl: typeof fetch,
  state: { progress: BundleSaveProgress<Key> | null },
  target = "",
) {
  return saveBundleDocuments({
    bundle: BUNDLE,
    keys: KEYS,
    targetClientId: target,
    newClientName: "テスト花子",
    progress: state.progress,
    onProgress: (p) => {
      state.progress = p;
    },
    fetchImpl,
  });
}

describe("saveBundleDocuments", () => {
  it("新しい利用者を1人作り、全部の帳票をその利用者へ1回ずつ保存する", async () => {
    const f = fakeFetch();
    const state = { progress: null as BundleSaveProgress<Key> | null };
    const done = await press(f.impl, state);
    expect(f.clientPosts()).toHaveLength(1);
    expect(f.clientPosts()[0].body).toEqual({ name: "テスト花子" });
    expect(f.documentPosts().map((c) => c.body)).toEqual([
      { clientId: "new-1", docType: "assessment", content: { a: 1 }, source: "rescue" },
      { clientId: "new-1", docType: "carePlan", content: { b: 2 }, source: "rescue" },
      { clientId: "new-1", docType: "monitoring", content: { c: 3 }, source: "rescue" },
    ]);
    expect(done).toEqual({
      clientId: "new-1",
      clientCode: "B",
      createdClient: true,
      savedKeys: ["assessment", "carePlan", "monitoring"],
    });
  });

  it("途中の1枚が失敗したら職員向けの文で投げ、それまでの途中経過（作った利用者・済んだ帳票）を渡してある", async () => {
    const f = fakeFetch({ failDocumentCalls: [2] });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state)).rejects.toThrow("利用者の情報を読み込めませんでした。");
    expect(state.progress).toEqual({
      clientId: "new-1",
      clientCode: "B",
      createdClient: true,
      savedKeys: ["assessment"],
    });
  });

  it("押し直しでは利用者をもう1人作らず、同じ利用者へ残りの帳票だけを保存する", async () => {
    const f = fakeFetch({ failDocumentCalls: [2] });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state)).rejects.toThrow();
    const done = await press(f.impl, state);

    expect(f.clientPosts()).toHaveLength(1);
    const saved = f.documentPosts().map((c) => `${c.body.clientId}:${c.body.docType}`);
    // 1回目: assessment 済み・carePlan 失敗 / 2回目: carePlan と monitoring だけ
    expect(saved).toEqual([
      "new-1:assessment",
      "new-1:carePlan",
      "new-1:carePlan",
      "new-1:monitoring",
    ]);
    expect(done.savedKeys).toEqual(["assessment", "carePlan", "monitoring"]);
  });

  it("1枚目で失敗しても、押し直しは作った利用者へ保存する（作った直後に途中経過を渡す）", async () => {
    const f = fakeFetch({ failDocumentCalls: [1] });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state)).rejects.toThrow();
    expect(state.progress).toMatchObject({ clientId: "new-1", savedKeys: [] });
    await press(f.impl, state);
    expect(f.clientPosts()).toHaveLength(1);
    expect(new Set(f.documentPosts().map((c) => c.body.clientId))).toEqual(new Set(["new-1"]));
  });

  it("押し直しでは、画面で選び直した保存先があっても前回の保存先に固定する（一式を2人に分けない）", async () => {
    const f = fakeFetch({ failDocumentCalls: [2] });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state)).rejects.toThrow();
    await press(f.impl, state, "c-other");
    expect(new Set(f.documentPosts().map((c) => c.body.clientId))).toEqual(new Set(["new-1"]));
  });

  it("既にいる利用者を選んだときは利用者を作らず、押し直しでも保存済みの帳票を二重に保存しない", async () => {
    const f = fakeFetch({ failDocumentCalls: [3] });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state, "c1")).rejects.toThrow();
    expect(state.progress).toEqual({
      clientId: "c1",
      clientCode: null,
      createdClient: false,
      savedKeys: ["assessment", "carePlan"],
    });
    await press(f.impl, state, "c1");
    expect(f.clientPosts()).toHaveLength(0);
    expect(f.documentPosts().map((c) => c.body.docType)).toEqual([
      "assessment",
      "carePlan",
      "monitoring",
      "monitoring",
    ]);
  });

  it("利用者を作れなければ途中経過を渡さない（押し直しは作るところからやり直す）", async () => {
    const f = fakeFetch({ failClient: true });
    const state = { progress: null as BundleSaveProgress<Key> | null };
    await expect(press(f.impl, state)).rejects.toThrow("利用者を登録できませんでした。");
    expect(state.progress).toBeNull();
    expect(f.documentPosts()).toHaveLength(0);
  });

  it("失敗の応答が JSON でなければ、代わりの文で投げる", async () => {
    const impl = (async () => new Response("<html>502</html>", { status: 502 })) as typeof fetch;
    await expect(
      saveBundleDocuments({
        bundle: BUNDLE,
        keys: KEYS,
        targetClientId: "c1",
        newClientName: "",
        progress: null,
        onProgress: () => {},
        fetchImpl: impl,
      }),
    ).rejects.toThrow("保存に失敗しました");
  });
});
