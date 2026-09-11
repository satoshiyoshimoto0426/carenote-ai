import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptString } from "@/lib/privacy/crypto";

/**
 * 名簿の fail-closed（独立審査 2026-09-11 critical #3/#4）を固定する。
 * Supabase は偽物（createServerClient を差し替え）にし、「クエリが error を返したら送らない」を機械で確かめる。
 */

type Result = { data: unknown; error: { message: string; code?: string } | null };
const results = new Map<string, Result | Result[]>();
const calls: { table: string; op: string; args: unknown[] }[] = [];

/** table ごとの結果を返す（配列なら呼ばれるたびに先頭から消費＝1回目失敗・2回目成功の再現用） */
function nextResult(table: string): Result {
  const r = results.get(table);
  if (Array.isArray(r)) return r.length > 1 ? (r.shift() as Result) : r[0];
  return r ?? { data: [], error: null };
}

/** from(table).select().eq()... のどこで await されても結果が返る偽ビルダー（Promise にメソッドを生やす） */
function fakeFrom(table: string) {
  const chain = Promise.resolve(nextResult(table)) as Promise<Result> & Record<string, unknown>;
  for (const op of ["select", "eq", "delete", "insert", "order", "limit", "single"]) {
    chain[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      return chain;
    };
  }
  return chain;
}

vi.mock("../supabase/server", () => ({ createServerClient: () => ({ from: fakeFrom }) }));

const KEY = randomBytes(32);
process.env.CARENOTE_PII_KEY = KEY.toString("base64");

const { AliasLoadError, deleteRelatedPerson, getClientAliases, RELATED_TABLE_MISSING_MESSAGE } =
  await import("./clients");

function ok(table: string, data: unknown) {
  results.set(table, { data, error: null });
}
function fail(table: string, message: string, code?: string) {
  results.set(table, { data: null, error: { message, code } });
}

describe("getClientAliases: 名簿が読めなければ AliasLoadError（送信中止）", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
    ok("clients", [{ id: "c1", code: "A" }]);
    ok("client_identities", [{ client_id: "c1", name_encrypted: encryptString("山田花子", KEY) }]);
    ok("client_related_identities", [
      { client_id: "c1", relation: "長女", name_encrypted: encryptString("佐藤一郎", KEY) },
    ]);
  });

  it("正常時は利用者と関係者を含む対応表を返す", async () => {
    const aliases = await getClientAliases("u1");
    expect(aliases).toContainEqual({ real: "山田花子", code: "A様" });
    expect(aliases).toContainEqual({ real: "佐藤一郎", code: "A様の長女" });
    // 所有者スコープ（created_by=u1）が3表すべてに付く
    const scoped = calls.filter((c) => c.op === "eq" && c.args[0] === "created_by");
    expect(scoped.map((c) => c.table).sort()).toEqual([
      "client_identities",
      "client_related_identities",
      "clients",
    ]);
  });

  it("利用者表が読めなければ（1回読み直しても）AliasLoadError を投げ、空配列で進まない", async () => {
    fail("clients", "JWT issued at future");
    await expect(getClientAliases("u1")).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("関係者表の一時エラーも warn で握りつぶさず AliasLoadError にする（critical #3）", async () => {
    fail("client_related_identities", "connection reset");
    await expect(getClientAliases("u1")).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("関係者表が未作成（42P01 / PGRST205）なら、管理者向けの文言で止める（読み直さない）", async () => {
    fail(
      "client_related_identities",
      'relation "client_related_identities" does not exist',
      "42P01",
    );
    let caught: unknown;
    try {
      await getClientAliases("u1");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AliasLoadError);
    expect((caught as Error).message).toBe(RELATED_TABLE_MISSING_MESSAGE);
    // 読み直していない（clients の select は1回）
    expect(calls.filter((c) => c.table === "clients" && c.op === "select")).toHaveLength(1);
  });

  it("1回目失敗・2回目成功なら対応表を返す（一時的な揺らぎの吸収）", async () => {
    results.set("clients", [
      { data: null, error: { message: "flaky" } },
      { data: [{ id: "c1", code: "A" }], error: null },
    ]);
    const aliases = await getClientAliases("u1");
    expect(aliases).toContainEqual({ real: "山田花子", code: "A様" });
  });
});

describe("deleteRelatedPerson: 所有者・利用者で絞り、0件は not_found", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
  });

  it("削除できたら ok、条件に created_by と client_id が付く", async () => {
    ok("client_related_identities", [{ id: "r1" }]);
    expect(await deleteRelatedPerson("r1", "c1", "u1")).toBe("ok");
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["created_by", "u1"]);
    expect(eqs).toContainEqual(["client_id", "c1"]);
    expect(eqs).toContainEqual(["id", "r1"]);
  });

  it("対象が無ければ not_found、DB エラーは error", async () => {
    ok("client_related_identities", []);
    expect(await deleteRelatedPerson("other", "c1", "u1")).toBe("not_found");
    fail("client_related_identities", "boom");
    expect(await deleteRelatedPerson("r1", "c1", "u1")).toBe("error");
  });
});
