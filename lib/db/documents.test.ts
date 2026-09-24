import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 利用者一覧の日付の列の材料（getLatestDocMeta）が、黙って欠けないこと・他人の書類を読まないことを固定する
 * （作り直し計画 U5）。
 *
 * なぜ必要か:
 *   PostgREST（Supabase）は1回の応答を既定 1000 行で**黙って**切る。1回で読み切るつもりの書き方だと、
 *   書類の多い職員ほど、ある種類の書類を「まだありません」と見せてしまう（名簿でも同じ罠を踏んでいる ──
 *   lib/db/clients.ts の assertUnderRowLimit）。入口のテストは lib/db をまるごと偽物にするので、ここでしか守れない。
 *
 * 偽の Supabase は、本物の PostgREST と同じく「頼まれた範囲（range）を、1回 1000 行までで返す」。
 */

interface Query {
  table: string;
  select: string;
  inColumn: string;
  inValues: string[];
  eq: Record<string, unknown>;
  order: string[];
  range: [number, number] | null;
}

const fake = vi.hoisted(() => ({
  /** documents 表の行 */
  rows: [] as Record<string, unknown>[],
  /** PostgREST の1回の応答の上限（Supabase の既定） */
  cap: 1000,
  /** 何番目の問い合わせを失敗させるか（1から数える。0 は失敗させない） */
  failAt: 0,
  queries: [] as Query[],
}));

vi.mock("../supabase/server", () => ({
  createServerClient: () => ({
    from(table: string) {
      const q: Query = {
        table,
        select: "",
        inColumn: "",
        inValues: [],
        eq: {},
        order: [],
        range: null,
      };
      const respond = () => {
        fake.queries.push(q);
        if (fake.queries.length === fake.failAt) {
          return { data: null, error: { code: "08006", message: "connection failure" } };
        }
        const matched = fake.rows.filter(
          (r) =>
            q.inValues.includes(String(r[q.inColumn])) &&
            Object.entries(q.eq).every(([k, v]) => r[k] === v),
        );
        const [from, to] = q.range ?? [0, matched.length - 1];
        const end = Math.min(to + 1, from + fake.cap);
        const cols = q.select.split(",").map((c) => c.trim());
        const data = matched
          .slice(from, end)
          .map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
        return { data, error: null };
      };
      const chain = {
        select(columns: string) {
          q.select = columns;
          return chain;
        },
        in(column: string, values: readonly string[]) {
          q.inColumn = column;
          q.inValues = [...values];
          return chain;
        },
        eq(column: string, value: unknown) {
          q.eq[column] = value;
          return chain;
        },
        order(column: string, options?: { ascending?: boolean }) {
          q.order.push(`${column}:${options?.ascending === false ? "desc" : "asc"}`);
          return chain;
        },
        range(from: number, to: number) {
          q.range = [from, to];
          return Promise.resolve(respond());
        },
      };
      return chain;
    },
  }),
}));

const { getLatestDocMeta, LATEST_DOCS_LOAD_FAILED_MESSAGE } = await import("./documents");
const { DbAccessError } = await import("./errors");

/** client の書類を n 行作る（id は重ならない。created_at は1行ごとに1分ずつ古くする）。 */
function docs(clientId: string, n: number, createdBy = "u1") {
  const base = Date.parse("2026-09-01T00:00:00Z");
  return Array.from({ length: n }, (_, i) => ({
    id: `${clientId}-${createdBy}-${i}`,
    client_id: clientId,
    doc_type: "supportLog",
    status: i % 2 === 0 ? "draft" : "approved",
    content: { memo: "本文（読まれてはいけない）" },
    created_by: createdBy,
    created_at: new Date(base - i * 60_000).toISOString(),
  }));
}

let quiet: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fake.rows = [];
  fake.cap = 1000;
  fake.failAt = 0;
  fake.queries = [];
  // 失敗させる検査で lib/db がサーバのログへ残すので、テストの出力を埋めないよう黙らせる
  quiet = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  quiet.mockRestore();
});

describe("getLatestDocMeta: 1000 行で黙って切れない", () => {
  it("1回 1000 行までしか返さない相手でも、2500 行を全部読む（満杯のページの次も読みに行く）", async () => {
    fake.rows = docs("c1", 2500);
    const out = await getLatestDocMeta(["c1"], "u1");
    expect(out).toHaveLength(2500);
    expect(new Set(out.map((r) => r.createdAt)).size).toBe(2500);

    // ページは隙間も重なりも無く続き、満杯でないページ（ここでは 0 行）が来て終わる
    const ranges = fake.queries.map((q) => q.range);
    expect(ranges.length).toBeGreaterThan(2);
    ranges.forEach((r, i) => {
      if (!r) throw new Error("range を使っていない");
      if (i > 0) expect(r[0]).toBe((ranges[i - 1] as [number, number])[1] + 1);
    });
  });

  it("1ページで頼む行数は、応答の上限（1000 行）以下（上限で切られたページを「最後」と取り違えない）", async () => {
    fake.rows = docs("c1", 1);
    await getLatestDocMeta(["c1"], "u1");
    const [from, to] = fake.queries[0].range as [number, number];
    expect(to - from + 1).toBeLessThanOrEqual(1000);
  });

  it("満杯でないページが来たら、そこで止まる（余計に読まない）", async () => {
    fake.rows = docs("c1", 3);
    const out = await getLatestDocMeta(["c1"], "u1");
    expect(out).toHaveLength(3);
    expect(fake.queries).toHaveLength(1);
  });

  it("並びを固定して読む（保存日時の新しい順＋id。並びが無いと、ページの境目で行がずれる）", async () => {
    fake.rows = docs("c1", 1200);
    await getLatestDocMeta(["c1"], "u1");
    for (const q of fake.queries) {
      expect(q.order).toEqual(["created_at:desc", "id:asc"]);
    }
  });
});

describe("getLatestDocMeta: 誰の・どの書類を読むか", () => {
  it("この職員が保存した書類だけ（created_by）。同じ利用者でも他の職員の書類は読まない", async () => {
    fake.rows = [...docs("c1", 2, "u1"), ...docs("c1", 3, "u2")];
    const out = await getLatestDocMeta(["c1"], "u1");
    expect(out).toHaveLength(2);
    for (const q of fake.queries) {
      expect(q.table).toBe("documents");
      expect(q.eq).toEqual({ created_by: "u1" });
    }
  });

  it("渡された利用者の書類だけ（利用者 id は 100 件ずつに分けて問い合わせる）", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `c${i}`);
    fake.rows = [...docs("c0", 1), ...docs("c249", 1), ...docs("c-outside", 5)];
    const out = await getLatestDocMeta(ids, "u1");
    expect(out.map((r) => r.clientId).sort()).toEqual(["c0", "c249"]);
    expect(fake.queries.map((q) => q.inValues.length)).toEqual([100, 100, 50]);
    expect(fake.queries.every((q) => q.inColumn === "client_id")).toBe(true);
    expect(fake.queries.flatMap((q) => q.inValues)).toEqual(ids);
  });

  it("書類の中身（content）は読まない。返すのは利用者・種類・状態・保存日時だけ", async () => {
    fake.rows = docs("c1", 1);
    const out = await getLatestDocMeta(["c1"], "u1");
    expect(fake.queries[0].select).not.toContain("content");
    expect(fake.queries[0].select).not.toContain("*");
    expect(out).toEqual([
      {
        clientId: "c1",
        docType: "supportLog",
        status: "draft",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
  });

  it("利用者が0人なら DB に問い合わせず [] を返す", async () => {
    await expect(getLatestDocMeta([], "u1")).resolves.toEqual([]);
    expect(fake.queries).toHaveLength(0);
  });
});

describe("getLatestDocMeta: DB を読めなければ投げる（途中まで読んだ分を返さない）", () => {
  it.each([
    ["1ページ目", 1],
    ["満杯のページの次（2ページ目）", 2],
  ])("%sで失敗したら DbAccessError と職員向けの文", async (_name, failAt) => {
    fake.rows = docs("c1", 700);
    fake.failAt = failAt;
    const err = await getLatestDocMeta(["c1"], "u1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbAccessError);
    expect((err as InstanceType<typeof DbAccessError>).publicMessage).toBe(
      LATEST_DOCS_LOAD_FAILED_MESSAGE,
    );
    // 職員向けの文は「無い」と言わない
    expect(LATEST_DOCS_LOAD_FAILED_MESSAGE).not.toMatch(/ありません|見つかりません/);
  });

  it("2つ目の利用者のまとまりで失敗しても投げる（1つ目のまとまりの分だけを返さない）", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `c${i}`);
    fake.rows = docs("c0", 2);
    fake.failAt = 2;
    await expect(getLatestDocMeta(ids, "u1")).rejects.toBeInstanceOf(DbAccessError);
  });
});
