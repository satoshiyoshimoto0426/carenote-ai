import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 見張り（センサー）: lib/db の関数は、DB の失敗を「0件・見えない・空」と答えない。
 *
 * なぜ必要か（2026-09-24 検収の指摘・steering-log「DB の失敗を『無い・空』と答えていた」）:
 *   同じ種類の不具合を 3 回踏んだ（2026-09-18 文字起こしの表が無いのを「権限がありません」・U0 の getClients の []・
 *   S1 の getClientById の null）。どれも「その関数の中」で直したので、隣の関数（関係者・書類・文字起こし・評価の履歴）に
 *   同じ書き方が残っていた。関数ごとの検査では、新しい関数や書き換えた関数で再発しても誰も気づかない。
 *
 * どう見張るか（故障の注入）:
 *   Supabase を偽物にし、関数を1回ふつうに動かして問い合わせの数を数える。次に「1番目だけ失敗」「2番目だけ失敗」…と
 *   1つずつ失敗させて動かし直し、どの場合も次のどれかであることを確かめる。
 *     ① 例外を投げる（入口が 503 などにする）
 *     ② その関数が「失敗」と決めてある値を返す（FAILURE に理由つきで書く。例: 保存の null は「保存に失敗」だけを表す）
 *     ③ 読み直して成功と同じ答えを返す（読み直しを持つ関数だけ。retries: true）
 *   「0件」「見えない」「空」と同じ値（null・[]・false・"not_found" など）を返したら落ちる。
 *
 * 抜けを防ぐ: lib/db.ts・lib/db/*.ts が export する async 関数は、すべて下の CONTRACTS に載っていなければ落ちる
 *   （新しい関数を足したら、DB が落ちたときに何を返すかを決めてここへ書く）。
 * 決まりの正本は lib/db/errors.ts の説明と CLAUDE.md「lib/db の読み書き」。
 */

const fake = vi.hoisted(() => ({
  /** 何番目の問い合わせを失敗させるか（1から数える。0 は失敗させない） */
  failAt: 0,
  /** これまでの問い合わせの数 */
  count: 0,
  /** 問い合わせの記録（落ちたときにどれを失敗させたかを名指しする） */
  queries: [] as string[],
  /** 成功するときに返す行（表と操作から決める。暗号化が要るので import の後で入れる） */
  dataFor: (() => null) as (table: string, ops: string[], one: boolean) => unknown,
  /** 失敗させたときの応答。PostgreSQL の connection_failure（0件・表の未作成・uuid の形違いとは別物） */
  failure: { code: "08006", message: "connection failure" },
}));

vi.mock("../supabase/server", () => ({
  createServerClient: () => ({
    from(table: string) {
      const ops: string[] = [];
      /** single / maybeSingle で終えたか（終えたら、await 用の問い合わせは数えない） */
      let ended = false;
      const run = (terminal: "single" | "maybeSingle" | "await") => {
        ended = true;
        fake.count += 1;
        fake.queries.push(`${table}.${ops.join(".")}.${terminal}`);
        if (fake.count === fake.failAt) return { data: null, error: fake.failure };
        return { data: fake.dataFor(table, ops, terminal !== "await"), error: null };
      };
      // .order() や .limit() の後でそのまま await する書き方にも答える。答えは次の小さな待ちで作るので、
      // その時点では select / eq などの呼び出し（同じ式の中で続けて呼ばれる）が ops に揃っている
      const chain = Promise.resolve().then(() =>
        ended ? undefined : run("await"),
      ) as Promise<unknown> & Record<string, unknown>;
      chain.single = () => Promise.resolve(run("single"));
      chain.maybeSingle = () => Promise.resolve(run("maybeSingle"));
      for (const op of [
        "select",
        "insert",
        "update",
        "upsert",
        "delete",
        "eq",
        "or",
        "in",
        "is",
        "order",
        "limit",
        "range",
      ]) {
        chain[op] = () => {
          ops.push(op);
          return chain;
        };
      }
      return chain;
    },
  }),
}));

const KEY = randomBytes(32);
process.env.CARENOTE_PII_KEY = KEY.toString("base64");

const { encryptString } = await import("@/lib/privacy/crypto");
const evaluations = await import("@/lib/db");
const clients = await import("./clients");
const documents = await import("./documents");
const transcripts = await import("./transcripts");

const SCOPE = { userId: "u1", orgId: "org_1" };
const AT = "2026-09-01T00:00:00Z";
const CLIENT = {
  id: "c1",
  org_id: "org_1",
  code: "A",
  attributes: {},
  created_by: "u1",
  created_at: AT,
  updated_at: AT,
};
const DOC = {
  id: "d1",
  client_id: "c1",
  org_id: "org_1",
  doc_type: "assessment",
  status: "draft",
  content: { a: 1 },
  source: "rescue",
  retention_until: AT,
  approved_at: null,
  approved_by: null,
  created_by: "u1",
  created_at: AT,
  updated_at: AT,
};

fake.dataFor = (table, ops, one) => {
  const has = (op: string) => ops.includes(op);
  switch (table) {
    case "clients":
      if (has("delete")) return [{ id: "c1" }];
      if (has("insert")) return { ...CLIENT, id: "c2", code: "B" };
      return one ? CLIENT : [CLIENT];
    case "client_identities":
      if (has("insert")) return null;
      return [{ client_id: "c1", name_encrypted: encryptString("山田花子", KEY) }];
    case "client_related_identities":
      if (has("delete")) return [{ id: "r1" }];
      if (has("insert")) return { id: "r2" };
      return [
        {
          id: "r1",
          client_id: "c1",
          relation: "長女",
          name_encrypted: encryptString("山田春子", KEY),
          created_at: AT,
        },
      ];
    case "documents":
      return one ? DOC : [DOC];
    case "client_transcripts": {
      if (has("delete")) return [{ id: "t1" }];
      const row = {
        id: "t1",
        client_id: "c1",
        kind: "meeting",
        title: "9月の会議",
        chars: 4,
        created_at: AT,
        retention_until: AT,
        text_encrypted: encryptString("会議の記録", KEY),
      };
      return one ? row : [row];
    }
    case "evaluations":
      if (has("insert")) return { id: "e1" };
      return [{ id: "e1", user_id: "u1", total_score: 20, created_at: AT }];
  }
  throw new Error(`偽の Supabase に無い表: ${table}`);
};

/** 1つの関数の約束。 */
interface Contract {
  /** どのファイルの関数か（抜けの検査で使う） */
  module: "lib/db.ts" | "clients" | "documents" | "transcripts";
  name: string;
  call: () => Promise<unknown>;
  /** DB が失敗したときに返してよい値（その関数が「失敗」と決めてある値）と、それが「無い・空」と紛れない理由 */
  failure?: { is: (v: unknown) => boolean; why: string };
  /** 読み直して成功できる関数か（成功と同じ答えを返してよい） */
  retries?: boolean;
}

const CONTRACTS: Contract[] = [
  {
    module: "lib/db.ts",
    name: "saveEvaluation",
    call: () =>
      evaluations.saveEvaluation({
        userId: "u1",
        clientName: "A",
        fileName: "a.pdf",
        totalScore: 20,
        result: {} as Parameters<typeof evaluations.saveEvaluation>[0]["result"],
      }),
    failure: {
      is: (v) => v === null,
      why: "保存の null は「保存に失敗」だけを表す（0件の意味を持たない）",
    },
  },
  { module: "lib/db.ts", name: "getEvaluations", call: () => evaluations.getEvaluations("u1") },
  {
    module: "clients",
    name: "createClientRecord",
    call: () =>
      clients.createClientRecord({ userId: "u1", orgId: "org_1", input: { name: "山田花子" } }),
    failure: {
      is: (v) => v === null,
      why: "登録の null は「登録できなかった」だけを表す（POST /api/clients が 500「利用者の作成に失敗しました。」）",
    },
  },
  { module: "clients", name: "getClients", call: () => clients.getClients(SCOPE) },
  { module: "clients", name: "getClientById", call: () => clients.getClientById("c1", SCOPE) },
  {
    module: "clients",
    name: "getClientAliases",
    call: () => clients.getClientAliases(SCOPE),
    retries: true,
  },
  {
    module: "clients",
    name: "getRelatedPeople",
    call: () => clients.getRelatedPeople("c1", SCOPE),
  },
  {
    module: "clients",
    name: "addRelatedPerson",
    call: () =>
      clients.addRelatedPerson({
        clientId: "c1",
        userId: "u1",
        orgId: "org_1",
        relation: "長男",
        name: "山田一郎",
      }),
    failure: {
      is: (v) =>
        typeof v === "object" &&
        v !== null &&
        (v as { ok?: unknown }).ok === false &&
        (v as { error?: unknown }).error === "登録に失敗しました。",
      why: "「登録に失敗しました。」は失敗だけを表す（「見つかりません」と言わない）",
    },
  },
  {
    module: "clients",
    name: "deleteRelatedPerson",
    call: () => clients.deleteRelatedPerson("r1", "c1", SCOPE),
    failure: {
      is: (v) => v === "error",
      why: '"error" は "not_found" と別の値で、入口は 500「削除に失敗しました。」',
    },
  },
  {
    module: "documents",
    name: "saveDocument",
    call: () =>
      documents.saveDocument({
        userId: "u1",
        orgId: "org_1",
        input: { clientId: "c1", docType: "assessment", content: { a: 1 }, source: "rescue" },
      }),
    failure: { is: (v) => v === null, why: "保存の null は「保存に失敗」だけを表す（入口は 500）" },
  },
  {
    module: "documents",
    name: "getDocumentsByClient",
    call: () => documents.getDocumentsByClient("c1", "u1"),
  },
  {
    module: "documents",
    name: "getLatestDocMeta",
    call: () => documents.getLatestDocMeta(["c1"], "u1"),
  },
  {
    module: "documents",
    name: "approveDocument",
    call: () => documents.approveDocument("d1", "u1"),
  },
  {
    module: "documents",
    name: "unapproveDocument",
    call: () => documents.unapproveDocument("d1", "u1"),
  },
  {
    module: "transcripts",
    name: "saveTranscript",
    call: () =>
      transcripts.saveTranscript({
        clientId: "c1",
        kind: "meeting",
        title: "9月の会議",
        text: "会議の記録",
        userId: "u1",
        scope: SCOPE,
      }),
    failure: {
      is: (v) => JSON.stringify(v) === JSON.stringify({ ok: false, reason: "failed" }),
      why: '"failed" は "client_not_visible" と別の理由で、入口は 500「保存できませんでした。」',
    },
  },
  {
    module: "transcripts",
    name: "getTranscriptsByClient",
    call: () => transcripts.getTranscriptsByClient("c1", SCOPE),
  },
  {
    module: "transcripts",
    name: "getTranscriptText",
    call: () => transcripts.getTranscriptText("t1", SCOPE),
  },
  {
    module: "transcripts",
    name: "deleteTranscript",
    call: () => transcripts.deleteTranscript("t1", SCOPE),
  },
];

type Outcome = { rejected: true; error: unknown } | { rejected: false; value: unknown };

/** failAt 番目の問い合わせだけを失敗させて1回動かす。 */
async function runWith(failAt: number, call: () => Promise<unknown>): Promise<Outcome> {
  fake.failAt = failAt;
  fake.count = 0;
  fake.queries = [];
  try {
    return { rejected: false, value: await call() };
  } catch (error) {
    return { rejected: true, error };
  }
}

/** 成功したときの答えが「無い・空」でないこと（でないと、失敗の答えと見分けられず検査が空振りする） */
function isSubstantial(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object" && (v as { ok?: unknown }).ok === false) return false;
  return true;
}

let quiet: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  // 失敗させるたびに関数がサーバのログへ残すので、テストの出力を埋めないよう黙らせる
  quiet = [
    vi.spyOn(console, "error").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
  ];
});
afterEach(() => {
  for (const s of quiet) s.mockRestore();
});

describe("lib/db の関数は、どの問い合わせを1つ失敗させても「無い・空・見えない」と答えない", () => {
  it.each(CONTRACTS.map((c) => [c.name, c] as const))("%s", async (_name, c) => {
    const normal = await runWith(0, c.call);
    if (normal.rejected) throw normal.error;
    // 偽の行で成功し、答えが「無い・空」でないこと（ここが崩れると下の検査が何も見ていないことになる）
    expect(isSubstantial(normal.value), `${c.name} が偽の行で成功しない`).toBe(true);
    const total = fake.count;
    expect(total, `${c.name} が DB に問い合わせていない`).toBeGreaterThan(0);

    // 失敗の後で別の道（取り消しなど）に入ることもあるので、失敗させた番号まで問い合わせが届いた限り続ける
    let tried = 0;
    for (let i = 1; i <= 20; i++) {
      const r = await runWith(i, c.call);
      if (fake.count < i) break;
      tried++;
      const failed = fake.queries[i - 1];
      if (r.rejected) {
        expect(r.error, `${c.name}: ${failed} の失敗で Error 以外を投げた`).toBeInstanceOf(Error);
        continue;
      }
      const allowed =
        c.failure?.is(r.value) === true ||
        (c.retries === true && JSON.stringify(r.value) === JSON.stringify(normal.value));
      expect(
        allowed,
        `${c.name}: ${i}番目の問い合わせ（${failed}）を失敗させたら ${JSON.stringify(r.value)} を返した。` +
          "DB の失敗は投げるか、失敗だけを表す値で返す（lib/db/errors.ts）",
      ).toBe(true);
    }
    expect(tried).toBeGreaterThanOrEqual(total);
  });
});

describe("抜けの検査: lib/db の async 関数はすべて上の約束に載っている", () => {
  const modules = {
    "lib/db.ts": evaluations,
    clients,
    documents,
    transcripts,
  } as const;

  it.each(Object.keys(modules) as (keyof typeof modules)[])("%s", (name) => {
    const exported = Object.entries(modules[name])
      .filter(
        ([, v]) =>
          typeof v === "function" &&
          (v as { constructor: { name: string } }).constructor.name === "AsyncFunction",
      )
      .map(([k]) => k)
      .sort();
    const listed = CONTRACTS.filter((c) => c.module === name)
      .map((c) => c.name)
      .sort();
    expect(
      exported.length,
      `${name} の async 関数を1つも見つけられない（数え方が壊れている）`,
    ).toBeGreaterThan(0);
    expect(exported, "新しい関数は、DB が落ちたときの答えを決めて CONTRACTS に足す").toEqual(
      listed,
    );
  });
});
