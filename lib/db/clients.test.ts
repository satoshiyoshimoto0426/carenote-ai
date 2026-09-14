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
  for (const op of ["select", "eq", "or", "in", "delete", "insert", "order", "limit", "single"]) {
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

const {
  ALIAS_PERMANENT_MESSAGE,
  AliasLoadError,
  createClientRecord,
  deleteRelatedPerson,
  getClientAliases,
  getClientById,
  getClients,
  getRelatedPeople,
  RELATED_TABLE_MISSING_MESSAGE,
  scopeExpr,
} = await import("./clients");

/** 事業所に所属していない職員（従来どおり自分の行だけ） */
const SOLO = { userId: "u1", orgId: null };

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
    const aliases = await getClientAliases(SOLO);
    expect(aliases).toContainEqual({ real: "山田花子", code: "A様" });
    expect(aliases).toContainEqual({ real: "佐藤一郎", code: "A様の長女" });
    // 範囲の絞り込みは利用者の表だけに付く（氏名の表は「親の利用者」で引く）
    const scoped = calls.filter((c) => c.op === "or" && c.args[0] === "created_by.eq.u1");
    expect(scoped.map((c) => c.table)).toEqual(["clients"]);
    // 氏名の2表は client_id で引く（org_id で別々に絞ると、移行の途中で氏名だけ落ちる）
    const byParent = calls.filter((c) => c.op === "in");
    expect(byParent.map((c) => c.table).sort()).toEqual([
      "client_identities",
      "client_related_identities",
    ]);
    for (const c of byParent) {
      expect(c.args[0]).toBe("client_id");
      expect(c.args[1]).toEqual(["c1"]);
    }
  });

  it("利用者表が読めなければ（1回読み直しても）AliasLoadError を投げ、空配列で進まない", async () => {
    fail("clients", "JWT issued at future");
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("関係者表の一時エラーも warn で握りつぶさず AliasLoadError にする（critical #3）", async () => {
    fail("client_related_identities", "connection reset");
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("関係者表が未作成（42P01 / PGRST205）なら、管理者向けの文言で止める（読み直さない）", async () => {
    fail(
      "client_related_identities",
      'relation "client_related_identities" does not exist',
      "42P01",
    );
    let caught: unknown;
    try {
      await getClientAliases(SOLO);
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
    const aliases = await getClientAliases(SOLO);
    expect(aliases).toContainEqual({ real: "山田花子", code: "A様" });
  });
});

describe("deleteRelatedPerson: 所有者・利用者で絞り、0件は not_found", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
  });

  it("削除できたら ok、条件に created_by と client_id が付く", async () => {
    ok("clients", { id: "c1", code: "A" });
    ok("client_related_identities", [{ id: "r1" }]);
    expect(await deleteRelatedPerson("r1", "c1", SOLO)).toBe("ok");
    const eqs = calls.filter((c) => c.op === "eq").map((c) => c.args);
    expect(eqs).toContainEqual(["client_id", "c1"]);
    expect(eqs).toContainEqual(["id", "r1"]);
    expect(calls.filter((c) => c.op === "or").map((c) => c.args)).toContainEqual([
      "created_by.eq.u1",
    ]);
  });

  it("対象が無ければ not_found、DB エラーは error", async () => {
    ok("clients", { id: "c1", code: "A" });
    ok("client_related_identities", []);
    expect(await deleteRelatedPerson("other", "c1", SOLO)).toBe("not_found");
    fail("client_related_identities", "boom");
    expect(await deleteRelatedPerson("r1", "c1", SOLO)).toBe("error");
  });

  it("親の利用者が範囲外なら、関係者の表に触れずに not_found", async () => {
    results.set("clients", { data: null, error: { message: "no rows" } });
    ok("client_related_identities", [{ id: "r1" }]);
    expect(await deleteRelatedPerson("r1", "c1", SOLO)).toBe("not_found");
    expect(calls.some((c) => c.table === "client_related_identities")).toBe(false);
  });
});

describe("scopeExpr: 名簿をどこまで共有するか（G3b・2026-09-12）", () => {
  it("事業所に所属していなければ自分の行だけ", () => {
    expect(scopeExpr({ userId: "user_abc", orgId: null })).toBe("created_by.eq.user_abc");
  });

  it("事業所に所属していれば、事業所の行＋組織に入る前の自分の行", () => {
    expect(scopeExpr({ userId: "user_abc", orgId: "org_xyz" })).toBe(
      "org_id.eq.org_xyz,and(org_id.is.null,created_by.eq.user_abc)",
    );
  });

  it("org_id が null 同士を同じ事業所とみなさない（他テナントと混ざらない）", () => {
    const expr = scopeExpr({ userId: "user_abc", orgId: null });
    expect(expr).not.toContain("org_id");
  });

  it("想定外の id は絞り込みを外さず例外にする（fail-closed）", () => {
    expect(() => scopeExpr({ userId: "u1,or=(1.eq.1)", orgId: null })).toThrow();
    // org 側が壊れている時も止める。黙って「所属なし」に落とすと、同僚が登録した利用者が
    // 名簿から抜け、その実名が黒塗りされないまま AI へ出る（独立審査 2026-09-12）
    expect(() => scopeExpr({ userId: "user_abc", orgId: "org,evil" })).toThrow();
  });
});

describe("事業所で共有しているときの読み出し", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
    ok("clients", [{ id: "c1", code: "A" }]);
    ok("client_identities", [{ client_id: "c1", name_encrypted: encryptString("山田花子", KEY) }]);
    ok("client_related_identities", []);
  });

  it("利用者の表に事業所の絞り込みが付き、氏名の表は親の利用者で引く", async () => {
    await getClientAliases({ userId: "user_abc", orgId: "org_xyz" });
    const ors = calls.filter((c) => c.op === "or");
    expect(ors.map((c) => c.table)).toEqual(["clients"]);
    expect(
      calls
        .filter((c) => c.op === "in")
        .map((c) => c.table)
        .sort(),
    ).toEqual(["client_identities", "client_related_identities"]);
    for (const o of ors) {
      expect(o.args[0]).toBe("org_id.eq.org_xyz,and(org_id.is.null,created_by.eq.user_abc)");
    }
  });
});

describe("読み出しはすべて範囲（scopeExpr）を通る", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
  });

  /** どの関数を呼んでも or(...) に範囲の式が渡ること＝1本でも素通りしたら落ちる */
  const ORG = { userId: "user_abc", orgId: "org_xyz" };
  const EXPR = "org_id.eq.org_xyz,and(org_id.is.null,created_by.eq.user_abc)";

  it("getClients", async () => {
    ok("clients", []);
    await getClients(ORG);
    expect(calls.filter((c) => c.op === "or").map((c) => c.args[0])).toContain(EXPR);
  });

  it("getClientById", async () => {
    ok("clients", { id: "c1", code: "A" });
    await getClientById("c1", ORG);
    expect(calls.filter((c) => c.op === "or").map((c) => c.args[0])).toContain(EXPR);
  });

  it("getRelatedPeople（親の利用者で範囲を確かめてから関係者を読む）", async () => {
    ok("clients", { id: "c1", code: "A" });
    ok("client_related_identities", []);
    await getRelatedPeople("c1", ORG);
    const ors = calls.filter((c) => c.op === "or");
    expect(ors.map((c) => c.table)).toEqual(["clients"]);
    expect(ors[0].args[0]).toBe(EXPR);
    // 関係者は親の利用者IDだけで引く（org_id で別途絞ると画面と名簿の見え方がズレる）
    expect(
      calls
        .filter((c) => c.table === "client_related_identities" && c.op === "eq")
        .map((c) => c.args),
    ).toContainEqual(["client_id", "c1"]);
  });

  it("getRelatedPeople は親の利用者が範囲外なら中身を読まない", async () => {
    results.set("clients", { data: null, error: { message: "no rows" } });
    ok("client_related_identities", [
      {
        id: "r1",
        client_id: "c1",
        relation: "長女",
        name_encrypted: encryptString("佐藤一郎", KEY),
      },
    ]);
    expect(await getRelatedPeople("c1", ORG)).toEqual([]);
    expect(calls.some((c) => c.table === "client_related_identities")).toBe(false);
  });
});

describe("記号の採番（同じ A様 を2人に振らない）", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
  });

  const clientRow = (code: string) => ({
    id: "new",
    org_id: null,
    code,
    attributes: {},
    created_by: "u1",
    created_at: "",
    updated_at: "",
  });

  it("記号が競合したら取り直す（1回で諦めない）", async () => {
    results.set("clients", [
      { data: [{ code: "A" }], error: null }, // 1回目の採番 → B
      { data: null, error: { message: "x", code: "23505" } }, // 同時登録でぶつかった
      { data: [{ code: "A" }, { code: "B" }], error: null }, // 読み直し → C
      { data: clientRow("C"), error: null },
    ]);
    const rec = await createClientRecord({ userId: "u1", orgId: null, input: { attributes: {} } });
    expect(rec?.code).toBe("C");
    const inserted = calls
      .filter((c) => c.table === "clients" && c.op === "insert")
      .map((c) => (c.args[0] as { code: string }).code);
    expect(inserted).toEqual(["B", "C"]);
  });

  it("一意制約違反は英語の文言ではなく code(23505) で見分ける", async () => {
    results.set("clients", [
      { data: [], error: null },
      // 文言が英語でなくても取り直す
      { data: null, error: { message: "一意制約に違反しました", code: "23505" } },
      { data: [], error: null },
      { data: clientRow("A"), error: null },
    ]);
    const rec = await createClientRecord({ userId: "u1", orgId: null, input: { attributes: {} } });
    expect(rec?.code).toBe("A");
    expect(calls.filter((c) => c.table === "clients" && c.op === "insert")).toHaveLength(2);
  });

  it("一意制約以外の失敗は取り直さない（無駄に何度も書きに行かない）", async () => {
    results.set("clients", [
      { data: [], error: null },
      { data: null, error: { message: "permission denied", code: "42501" } },
    ]);
    expect(
      await createClientRecord({ userId: "u1", orgId: null, input: { attributes: {} } }),
    ).toBeNull();
    expect(calls.filter((c) => c.table === "clients" && c.op === "insert")).toHaveLength(1);
  });

  it("取り消しは作った行だけを消す（id で絞る）", async () => {
    results.set("clients", [
      { data: [], error: null },
      { data: clientRow("A"), error: null },
      { data: [{ id: "new" }], error: null }, // delete の結果
    ]);
    fail("client_identities", "insert failed");
    await createClientRecord({
      userId: "u1",
      orgId: null,
      input: { name: "テスト花子", attributes: {} },
    });
    const del = calls.findIndex((c) => c.table === "clients" && c.op === "delete");
    expect(del).toBeGreaterThanOrEqual(0);
    expect(
      calls
        .slice(del)
        .filter((c) => c.op === "eq")
        .map((c) => c.args),
    ).toContainEqual(["id", "new"]);
  });

  it("スコープ内の最大＋1 を振る（件数ではなく最大値で決める）", async () => {
    // 事業所に A と C がある（B は削除済み）→ 件数は2だが、次は D でなければならない
    results.set("clients", [
      { data: [{ code: "A" }, { code: "C" }], error: null },
      {
        data: {
          id: "new",
          org_id: "org_xyz",
          code: "D",
          attributes: {},
          created_by: "user_abc",
          created_at: "",
          updated_at: "",
        },
        error: null,
      },
    ]);
    const rec = await createClientRecord({
      userId: "user_abc",
      orgId: "org_xyz",
      input: { attributes: {} },
    });
    expect(rec?.code).toBe("D");
    const inserted = calls.find((c) => c.table === "clients" && c.op === "insert");
    expect((inserted?.args[0] as { code: string }).code).toBe("D");
  });

  it("既存の記号を読めなければ登録しない（当てずっぽうで採番しない）", async () => {
    fail("clients", "connection reset");
    expect(
      await createClientRecord({ userId: "user_abc", orgId: null, input: { attributes: {} } }),
    ).toBeNull();
    expect(calls.some((c) => c.op === "insert")).toBe(false);
  });

  it("実名の保存に失敗したら利用者ごと取り消す（名前の無い利用者を残さない）", async () => {
    results.set("clients", [
      { data: [], error: null },
      {
        data: {
          id: "new",
          org_id: null,
          code: "A",
          attributes: {},
          created_by: "u1",
          created_at: "",
          updated_at: "",
        },
        error: null,
      },
      { data: null, error: null },
    ]);
    fail("client_identities", "insert failed");
    const rec = await createClientRecord({
      userId: "u1",
      orgId: null,
      input: { name: "山田花子", attributes: {} },
    });
    expect(rec).toBeNull();
    expect(calls.some((c) => c.table === "clients" && c.op === "delete")).toBe(true);
  });
});

describe("名簿の安全網（移行の途中でも実名の取り違えを起こさない）", () => {
  beforeEach(() => {
    results.clear();
    calls.length = 0;
    ok("client_related_identities", []);
  });

  it("同じ記号に違う氏名が割り当たっていたら送信を止める", async () => {
    ok("clients", [
      { id: "c1", code: "A" },
      { id: "c2", code: "A" },
    ]);
    ok("client_identities", [
      { client_id: "c1", name_encrypted: encryptString("山田花子", KEY) },
      { client_id: "c2", name_encrypted: encryptString("佐藤一郎", KEY) },
    ]);
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("記号の重複は氏名を復号する前に見つける（復号できない行があっても取りこぼさない）", async () => {
    ok("clients", [
      { id: "c1", code: "A" },
      { id: "c2", code: "A" },
    ]);
    // 氏名は1件も復号できない状態。以前は「復号できた氏名」しか突き合わせていなかったため素通りした
    ok("client_identities", [{ client_id: "c1", name_encrypted: "こわれた値" }]);
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("空白の有無だけが違う別人がいたら送信を止める（黙って片方を捨てない）", async () => {
    ok("clients", [
      { id: "c1", code: "A" },
      { id: "c2", code: "B" },
    ]);
    ok("client_identities", [
      { client_id: "c1", name_encrypted: encryptString("山田 花子", KEY) },
      { client_id: "c2", name_encrypted: encryptString("山田花子", KEY) },
    ]);
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("同一人物の表記ゆれ（空白あり・なし）は止めない", async () => {
    ok("clients", [{ id: "c1", code: "A" }]);
    ok("client_identities", [{ client_id: "c1", name_encrypted: encryptString("山田 花子", KEY) }]);
    const aliases = await getClientAliases(SOLO);
    expect(aliases).toContainEqual({ real: "山田 花子", code: "A様" });
    expect(aliases).toContainEqual({ real: "山田花子", code: "A様" });
  });

  it("待っても直らない失敗は「少し待って」と言わない（管理者へ連絡を促す）", async () => {
    ok("clients", [
      { id: "c1", code: "A" },
      { id: "c2", code: "A" },
    ]);
    ok("client_identities", []);
    let caught: unknown;
    try {
      await getClientAliases(SOLO);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).message).toBe(ALIAS_PERMANENT_MESSAGE);
    // 読み直していない（clients の select は1回）
    expect(calls.filter((c) => c.table === "clients" && c.op === "select")).toHaveLength(1);
  });

  it("利用者が上限を超えたら送信を止める（黙って欠けた名簿で黒塗りしない）", async () => {
    ok(
      "clients",
      Array.from({ length: 901 }, (_, i) => ({ id: `c${i}`, code: `X${i}` })),
    );
    ok("client_identities", []);
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("氏名の表が上限を超えても送信を止める", async () => {
    ok("clients", [{ id: "c1", code: "A" }]);
    ok(
      "client_identities",
      Array.from({ length: 901 }, () => ({
        client_id: "c1",
        name_encrypted: encryptString("山田花子", KEY),
      })),
    );
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("関係者の表が上限を超えても送信を止める", async () => {
    ok("clients", [{ id: "c1", code: "A" }]);
    ok("client_identities", []);
    ok(
      "client_related_identities",
      Array.from({ length: 901 }, () => ({
        client_id: "c1",
        relation: "長女",
        name_encrypted: encryptString("佐藤一郎", KEY),
      })),
    );
    await expect(getClientAliases(SOLO)).rejects.toBeInstanceOf(AliasLoadError);
  });

  it("3表とも「上限＋1件」を要求する（＋1が無いと打ち切りを見分けられない）", async () => {
    ok("clients", [{ id: "c1", code: "A" }]);
    ok("client_identities", []);
    await getClientAliases(SOLO);
    const limited = calls.filter((c) => c.op === "limit");
    expect(limited.map((c) => c.table).sort()).toEqual([
      "client_identities",
      "client_related_identities",
      "clients",
    ]);
    // 901 = 上限900 ＋ 1。上限ちょうどを要求すると「ちょうど900件」と「打ち切られた」が区別できない
    for (const c of limited) expect(c.args[0]).toBe(901);
  });
});
