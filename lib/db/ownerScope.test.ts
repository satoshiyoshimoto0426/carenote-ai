import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 書類と点検の履歴を「本人の分だけ」に絞ることを、結果で固定する（2026-09-25 作り直し第1段の独立審査・確定6）。
 *
 * なぜ必要か: サーバーは Supabase のサービスロール鍵で問い合わせるので、行の保護（RLS）を通らない
 *   （lib/supabase/server.ts）。そのため lib/db の `.eq("created_by", userId)`・`.eq("user_id", userId)` の1行が
 *   唯一の守りになる。この行を消しても、以前は全テスト（1189件）が緑のままだった
 *   （lib/db/dbFailures.test.ts の偽物は操作の名前だけを記録し、引数を見ないため）。
 *
 * 偽の Supabase は、eq の条件で本当に行を絞り、update は絞った行だけを書き換える。
 * だから絞り込みの行を消すと、他の職員の書類が返る・書き換わる → このテストが赤になる。
 */

type Row = Record<string, unknown>;

interface Result {
  data: Row[] | Row | null;
  error: { code: string; message: string } | null;
}

/** 問い合わせの鎖。本物の Promise に部品を足す（lib/db/dbFailures.test.ts と同じ作り。then を自前で書かない） */
type Chain = Promise<Result | undefined> & {
  select(columns?: string): Chain;
  update(patch: Row): Chain;
  eq(column: string, value: unknown): Chain;
  order(column: string, options?: { ascending?: boolean }): Chain;
  limit(n: number): Chain;
  maybeSingle(): Promise<Result>;
};

const store = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("../supabase/server", () => ({
  createServerClient: () => ({
    from(table: string): Chain {
      const filters: [string, unknown][] = [];
      let patch: Row | null = null;
      let limitN: number | null = null;
      /** maybeSingle で終えたか（終えたら、await 用の問い合わせは走らせない＝二重に書き換えない） */
      let ended = false;
      const run = (): Row[] => {
        ended = true;
        const matched = (store.tables[table] ?? []).filter((r) =>
          filters.every(([k, v]) => r[k] === v),
        );
        if (patch) for (const r of matched) Object.assign(r, patch);
        const out = limitN === null ? matched : matched.slice(0, limitN);
        return out.map((r) => ({ ...r }));
      };
      // .order() や .limit() の後でそのまま await する書き方に答える。答えは次の小さな待ちで作るので、
      // その時点では select / eq などの呼び出し（同じ式の中で続けて呼ばれる）が揃っている
      const chain = Promise.resolve().then(() =>
        ended ? undefined : { data: run(), error: null },
      ) as Chain;
      chain.select = () => chain;
      chain.update = (p) => {
        patch = p;
        return chain;
      };
      chain.eq = (column, value) => {
        filters.push([column, value]);
        return chain;
      };
      chain.order = () => chain;
      chain.limit = (n) => {
        limitN = n;
        return chain;
      };
      chain.maybeSingle = async () => {
        const out = run();
        if (out.length > 1) {
          return { data: null, error: { code: "PGRST116", message: "multiple rows" } };
        }
        return { data: out[0] ?? null, error: null };
      };
      return chain;
    },
  }),
}));

const { getDocumentsByClient, approveDocument, unapproveDocument } = await import("./documents");
const { getEvaluations } = await import("../db");

const AT = "2026-09-25T00:00:00.000Z";
const doc = (id: string, createdBy: string, status: "draft" | "approved"): Row => ({
  id,
  client_id: "c1",
  org_id: "org_1",
  doc_type: "supportLog",
  status,
  content: {},
  source: "create",
  retention_until: AT,
  approved_at: status === "approved" ? AT : null,
  approved_by: status === "approved" ? createdBy : null,
  created_by: createdBy,
  created_at: AT,
  updated_at: AT,
});

beforeEach(() => {
  // 同じ利用者（c1・同じ事業所）に、職員 u1 と u2 がそれぞれ書類を保存している
  store.tables = {
    documents: [doc("d1", "u1", "draft"), doc("d2", "u2", "draft"), doc("d3", "u2", "approved")],
    evaluations: [
      { id: "e1", user_id: "u1", total_score: 20, created_at: AT },
      { id: "e2", user_id: "u2", total_score: 10, created_at: AT },
    ],
  };
});

const statusOf = (id: string) => store.tables.documents.find((r) => r.id === id)?.status;

describe("書類は、保存した本人の分だけを読む・承認する（lib/db/documents.ts）", () => {
  it("利用者の書類の一覧に、同じ事業所の同僚が保存した書類を混ぜない", async () => {
    const docs = await getDocumentsByClient("c1", "u1");
    expect(docs.map((d) => d.id)).toEqual(["d1"]);
  });

  it("同僚の書類の id を知っていても、承認できない（null・書類は下書きのまま）", async () => {
    expect(await approveDocument("d2", "u1")).toBeNull();
    expect(statusOf("d2")).toBe("draft");
  });

  it("同僚の承認済みの書類の承認を、取り消せない（null・承認済みのまま）", async () => {
    expect(await unapproveDocument("d3", "u1")).toBeNull();
    expect(statusOf("d3")).toBe("approved");
  });

  it("自分の書類なら承認できる（上の検査が空振りしていない証拠）", async () => {
    const rec = await approveDocument("d1", "u1");
    expect(rec?.status).toBe("approved");
    expect(rec?.approvedBy).toBe("u1");
    expect(statusOf("d1")).toBe("approved");
  });
});

describe("点検の履歴は、本人の分だけを読む（lib/db.ts）", () => {
  it("同僚の点検の履歴を混ぜない", async () => {
    const rows = await getEvaluations("u1");
    expect(rows.map((r) => r.id)).toEqual(["e1"]);
  });
});
