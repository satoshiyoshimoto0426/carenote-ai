import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 書類を利用者に保存する入口（POST /api/documents）の検査。
 *
 * なぜ必要か（作り直し計画 S1・2026-09-23）:
 *   この入口は Clerk の orgId をそのまま保存し、**保存先の利用者が本人に見えるかを確かめていなかった**。
 *   利用者の id さえ分かれば、他の事業所の利用者に書類を紐づけられた。つくるの結果も保存できるように
 *   なると、ここを通る書類が増える。「見えない利用者には保存しない（DB に書かない）」
 *   「保存は必ず下書き」「中身は帳票の形と大きさだけ受け取る」をここで固定する。
 *
 * 作りの要点:
 *   保存の関数（lib/db/documents.saveDocument）は本物を動かし、呼ばれたかどうかだけを見張る。
 *   その先の Supabase は偽物にして、実際に書き込もうとした行を記録する ── 入口が status を
 *   渡さなくても、保存層が draft 以外を書いたら赤になるようにするため。
 */

type Session = { userId: string | null; orgId: string | null };
const clerk = vi.hoisted(() => ({
  auth: vi.fn<() => Promise<Session>>(async () => ({ userId: "u1", orgId: "org_1" })),
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: clerk.auth }));

const clients = vi.hoisted(() => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, getClientById: clients.getClientById };
});

/** 本物の saveDocument をそのまま動かし、呼ばれたかどうかだけを記録する。 */
const docs = vi.hoisted(() => ({ saveDocument: vi.fn() }));
vi.mock("@/lib/db/documents", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/documents")>();
  docs.saveDocument.mockImplementation(orig.saveDocument);
  return { ...orig, saveDocument: docs.saveDocument };
});

/** Supabase の偽物。書き込もうとした表と行を記録し、書いた行をそのまま返す。 */
const sb = vi.hoisted(() => ({
  tables: [] as string[],
  inserted: [] as Record<string, unknown>[],
  insertError: null as { message: string } | null,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from(table: string) {
      sb.tables.push(table);
      let row: Record<string, unknown> | null = null;
      const chain = {
        insert(values: Record<string, unknown>) {
          sb.inserted.push(values);
          row = {
            approved_at: null,
            approved_by: null,
            ...values,
            id: "d1",
            created_at: "2026-09-23T00:00:00Z",
            updated_at: "2026-09-23T00:00:00Z",
          };
          return chain;
        },
        select() {
          return chain;
        },
        single() {
          return Promise.resolve(
            sb.insertError ? { data: null, error: sb.insertError } : { data: row, error: null },
          );
        },
      };
      return chain;
    },
  }),
}));

const { CLIENT_LOOKUP_FAILED_MESSAGE, ClientLookupError, SCOPE_ERROR_MESSAGE } = await import(
  "@/lib/db/clients"
);
const { POST } = await import("@/app/api/documents/route");

const SCOPE = { userId: "u1", orgId: "org_1" };
/** 保存する中身の上限（JSON にしたときの UTF-8 のバイト数）。この数そのものが約束なので値で固定する。 */
const LIMIT_BYTES = 200 * 1024;
/** 保存する中身の入れ子の深さの上限（中身そのものを 1 と数える）。帳票で最も深い第2表でも 5。 */
const LIMIT_DEPTH = 32;

/**
 * `{"a":{"a":...1}}` を depth 段の入れ子で、JSON の文字列として作る。
 * JSON.stringify に渡すと深い入れ子でテスト自身が落ちるので、文字列を直接つなぐ。
 */
const nestedJson = (depth: number) => `${'{"a":'.repeat(depth)}1${"}".repeat(depth)}`;
/** valid() と同じ欄で、content だけを生の JSON 文字列で差し込んだ本文。 */
const rawBodyWithContent = (contentJson: string) =>
  `{"clientId":"c1","docType":"assessment","source":"rescue","content":${contentJson}}`;

const CLIENT = {
  id: "c1",
  orgId: "org_1",
  code: "A",
  attributes: {},
  createdBy: "u2",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};
const DRAFT = { overview: "A様は週2回の通所を希望。", needs: ["入浴の見守り"] };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/documents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const valid = (extra: Record<string, unknown> = {}) => ({
  clientId: "c1",
  docType: "assessment",
  content: DRAFT,
  source: "rescue",
  ...extra,
});
const bytesOf = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).byteLength;

/** DB に一切書いていないこと（保存の関数も、Supabase への書き込みも無い）。 */
function expectNothingWritten() {
  expect(docs.saveDocument).not.toHaveBeenCalled();
  expect(sb.inserted).toHaveLength(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  sb.tables.length = 0;
  sb.inserted.length = 0;
  sb.insertError = null;
  clerk.auth.mockResolvedValue({ ...SCOPE });
  clients.getClientById.mockResolvedValue(CLIENT);
});

describe("誰が保存できるか", () => {
  it("ログインしていなければ 401（利用者も調べず、何も書かない）", async () => {
    clerk.auth.mockResolvedValue({ userId: null, orgId: null });
    const res = await POST(post(valid()));
    expect(res.status).toBe(401);
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it.each([
    ["userId が絞り込みを壊す形", { userId: "u1,or=(1.eq.1)", orgId: "org_1" }],
    ["orgId が絞り込みを壊す形", { userId: "u1", orgId: "org_1,or=(1.eq.1)" }],
  ])("%s なら 503 と JSON（DB に触らない）", async (_name, session) => {
    clerk.auth.mockResolvedValue(session);
    const res = await POST(post(valid()));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ error: SCOPE_ERROR_MESSAGE });
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("保存先の利用者は、ログイン中の範囲で調べる（画面が送る orgId は使わない）", async () => {
    await POST(post(valid({ orgId: "org_other" })));
    expect(clients.getClientById).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("見えない利用者（他の事業所・他の職員の分・存在しない id）には 404 で、保存の関数を呼ばない", async () => {
    clients.getClientById.mockResolvedValue(null);
    const res = await POST(post(valid({ clientId: "other-org-client" })));
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "利用者が見つかりません。" });
    expect(clients.getClientById).toHaveBeenCalledWith("other-org-client", SCOPE);
    expectNothingWritten();
  });

  /**
   * 2026-09-24 検収の指摘: 以前は DB の失敗も「見えない」と同じ null になり、404「利用者が見つかりません。」を
   * 返していた。救済モードの職員はその言葉を信じて「新しい利用者として保存」を選び、同じ方を二重に登録し得た。
   */
  it("利用者を DB から読めなければ 503 と職員向けの文言（404 にしない・保存の関数を呼ばない）", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    clients.getClientById.mockRejectedValue(new ClientLookupError("JWT issued at future"));
    const res = await POST(post(valid()));
    expect(res.status).toBe(503);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body).toEqual({ error: CLIENT_LOOKUP_FAILED_MESSAGE });
    expect(body.error).not.toContain("見つかりません");
    // DB の詳しい理由は画面へ出さない（サーバのログにだけ残す）
    expect(JSON.stringify(body)).not.toContain("JWT");
    expect(logged).toHaveBeenCalled();
    expectNothingWritten();
    logged.mockRestore();
  });
});

describe("何が保存されるか", () => {
  it("画面が承認済み・他人・他の事業所を名乗っても、本人の下書きとして保存する（G4）", async () => {
    const res = await POST(
      post(
        valid({
          status: "approved",
          approvedAt: "2026-09-23T00:00:00Z",
          approvedBy: "u9",
          createdBy: "u9",
          orgId: "org_other",
          retentionUntil: "2099-01-01T00:00:00Z",
        }),
      ),
    );
    expect(res.status).toBe(201);

    // 入口は決まった欄だけを渡す（status も承認の欄も渡さない）
    expect(docs.saveDocument).toHaveBeenCalledTimes(1);
    expect(docs.saveDocument).toHaveBeenCalledWith({
      userId: "u1",
      orgId: "org_1",
      input: { clientId: "c1", docType: "assessment", content: DRAFT, source: "rescue" },
    });

    // 実際に書こうとした行も draft・本人・ログイン中の事業所
    expect(sb.tables).toEqual(["documents"]);
    expect(sb.inserted).toHaveLength(1);
    const row = sb.inserted[0];
    expect(row.status).toBe("draft");
    expect(row.created_by).toBe("u1");
    expect(row.org_id).toBe("org_1");
    expect(row).not.toHaveProperty("approved_at");
    expect(row).not.toHaveProperty("approved_by");
    expect(row.retention_until).not.toBe("2099-01-01T00:00:00Z");

    const body = await res.json();
    expect(body.status).toBe("draft");
    expect(body.approvedAt).toBeNull();
    expect(body.approvedBy).toBeNull();
  });

  it("事業所を選んでいなければ、事業所なし（null）で保存する", async () => {
    clerk.auth.mockResolvedValue({ userId: "u1", orgId: null });
    const res = await POST(post(valid()));
    expect(res.status).toBe(201);
    expect(clients.getClientById).toHaveBeenCalledWith("c1", { userId: "u1", orgId: null });
    expect(sb.inserted[0].org_id).toBeNull();
  });

  it.each([
    ["つくる（create）", "create", "create"],
    ["一式まとめて（rescue）", "rescue", "rescue"],
    ["指定なし（以前からの救済モードの扱い）", undefined, "rescue"],
    ["知らない値", "evil", "rescue"],
  ])("生成元が%s（送る値 %s）なら %s として保存する", async (_name, source, expected) => {
    const res = await POST(post(valid({ source })));
    expect(res.status).toBe(201);
    expect(sb.inserted[0].source).toBe(expected);
  });

  it("書き込みに失敗したら 500（成功のふりをしない）", async () => {
    sb.insertError = { message: "db down" };
    const res = await POST(post(valid()));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "保存に失敗しました。" });
  });
});

describe("受け取る中身の形と大きさ", () => {
  it.each([
    ["配列", [DRAFT]],
    ["文字列", "A様は週2回の通所を希望。"],
    ["数値", 42],
    ["真偽値", true],
  ])("中身が%sなら 400（利用者も調べず、何も書かない）", async (_name, content) => {
    const res = await POST(post(valid({ content })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "保存する内容の形が正しくありません。" });
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it.each([
    ["無い", undefined],
    ["null", null],
  ])("中身が%sなら 400", async (_name, content) => {
    const res = await POST(post(valid({ content })));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "保存する内容がありません。" });
    expectNothingWritten();
  });

  it("ちょうど 200KB までは保存する", async () => {
    const content = { text: "a".repeat(LIMIT_BYTES - bytesOf({ text: "" })) };
    expect(bytesOf(content)).toBe(LIMIT_BYTES);
    const res = await POST(post(valid({ content })));
    expect(res.status).toBe(201);
  });

  it("200KB を1バイトでも超えたら 413（利用者も調べず、何も書かない）", async () => {
    const content = { text: "a".repeat(LIMIT_BYTES - bytesOf({ text: "" }) + 1) };
    expect(bytesOf(content)).toBe(LIMIT_BYTES + 1);
    const res = await POST(post(valid({ content })));
    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toHaveProperty("error");
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("大きさは文字数ではなくバイト数で数える（日本語は1字3バイト）", async () => {
    const content = { text: "あ".repeat(70_000) }; // 7万字 ＝ 21万バイト超
    expect(bytesOf(content)).toBeGreaterThan(LIMIT_BYTES);
    const res = await POST(post(valid({ content })));
    expect(res.status).toBe(413);
    expectNothingWritten();
  });

  it("利用者の指定が無ければ 400", async () => {
    const res = await POST(post(valid({ clientId: "" })));
    expect(res.status).toBe(400);
    expectNothingWritten();
  });

  it("知らない帳票種別は 400", async () => {
    const res = await POST(post(valid({ docType: "kyufu" })));
    expect(res.status).toBe(400);
    expectNothingWritten();
  });

  it("JSON として読めなければ 400", async () => {
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
    expectNothingWritten();
  });

  /**
   * 2026-09-24 検収の指摘: 本文が JSON の null だと req.json() は null を返し、`body.clientId` で
   * TypeError になって、JSON の無い 500 を返していた（書き込みは無かった）。
   */
  it.each([
    ["JSON の null", "null"],
    ["配列", JSON.stringify([valid()])],
    ["文字列", JSON.stringify("c1")],
    ["数値", "42"],
  ])("本文が%sなら 400 と JSON（利用者も調べず、何も書かない）", async (_name, raw) => {
    const res = await POST(post(raw));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ error: "リクエストの解析に失敗しました。" });
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });
});

/**
 * 2026-09-24 検収の指摘: 20万段の入れ子（約1.2MB）は JSON.parse では読めるが、大きさを測る
 * JSON.stringify がスタックを使い切って RangeError になり、入口は JSON の無い 500 を返していた。
 * 深さは再帰を使わずに数えるので、どれだけ深くても 400 で止まる。
 */
describe("受け取る中身の入れ子の深さ", () => {
  it(`ちょうど ${LIMIT_DEPTH} 段までは保存する`, async () => {
    const res = await POST(post(rawBodyWithContent(nestedJson(LIMIT_DEPTH))));
    expect(res.status).toBe(201);
    expect(docs.saveDocument).toHaveBeenCalledTimes(1);
  });

  it(`${LIMIT_DEPTH + 1} 段なら、200KB より小さくても 400（利用者も調べず、何も書かない）`, async () => {
    const raw = rawBodyWithContent(nestedJson(LIMIT_DEPTH + 1));
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(LIMIT_BYTES);
    const res = await POST(post(raw));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "保存する内容の形が正しくありません。" });
    expect(clients.getClientById).not.toHaveBeenCalled();
    expectNothingWritten();
  });

  it("配列の入れ子も同じ深さで数える", async () => {
    const raw = rawBodyWithContent(`{"a":${"[".repeat(LIMIT_DEPTH)}1${"]".repeat(LIMIT_DEPTH)}}`);
    const res = await POST(post(raw));
    expect(res.status).toBe(400);
    expectNothingWritten();
  });

  it("20万段の入れ子（検収で再現した形）でも、落ちずに 400 と JSON を返す", async () => {
    const raw = rawBodyWithContent(nestedJson(200_000));
    const res = await POST(post(raw));
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    await expect(res.json()).resolves.toEqual({ error: "保存する内容の形が正しくありません。" });
    expectNothingWritten();
  });
});
