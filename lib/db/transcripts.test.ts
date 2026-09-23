import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 保存層の「誰に見せるか」と「暗号化しているか」を固定する。
 *
 * なぜ必要か（独立審査 2026-09-17 critical）:
 *   この層は**黒塗りが効かない生の実名**を出し入れするのに、テストが1本も無かった。
 *   可視性の判定を6か所まとめて壊しても、463件のテストが全部緑のままだった。
 *   入口（route）のテストは db をまるごと偽物にするので、ここは守れない。
 */

const clients = vi.hoisted(() => ({ getClientById: vi.fn() }));
vi.mock("./clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./clients")>();
  return { ...orig, getClientById: clients.getClientById };
});

/** Supabase の呼び出しを記録する偽物（つながった呼び方をそのまま真似る）。 */
const calls = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  deleted: [] as string[],
  selectError: null as { code?: string; message?: string } | null,
  insertError: null as { code?: string; message?: string } | null,
  deleteError: null as { code?: string; message?: string } | null,
  /** 消す操作が消した行の数（既定 1。0 は「消す間際に他の人が消していた」） */
  deletedCount: 1,
  row: null as Record<string, unknown> | null,
  rows: [] as Record<string, unknown>[],
}));

vi.mock("../supabase/server", () => ({
  createServerClient: () => ({
    from() {
      const chain = {
        insert(values: Record<string, unknown>) {
          calls.inserted = values;
          return chain;
        },
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return Promise.resolve({ data: calls.rows, error: calls.selectError });
        },
        single() {
          return Promise.resolve({
            data: calls.insertError || calls.selectError ? null : calls.row,
            error: calls.insertError ?? calls.selectError,
          });
        },
        // 0件はエラーにしない（行が無ければ data が null）。PostgREST の maybeSingle と同じ
        maybeSingle() {
          return Promise.resolve({
            data: calls.selectError ? null : calls.row,
            error: calls.selectError,
          });
        },
        delete() {
          return {
            eq(_col: string, id: string) {
              return {
                // 消えた行を返させて件数を見る（lib/db/transcripts.ts の deleteTranscript）
                select() {
                  if (calls.deleteError)
                    return Promise.resolve({ data: null, error: calls.deleteError });
                  calls.deleted.push(id);
                  const data = Array.from({ length: calls.deletedCount }, () => ({ id }));
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
      };
      return chain;
    },
  }),
}));

const { decryptString, getPiiKey } = await import("@/lib/privacy/crypto");
const { ClientLookupError } = await import("./clients");
const { DbAccessError } = await import("./errors");
const {
  deleteTranscript,
  getTranscriptsByClient,
  getTranscriptText,
  saveTranscript,
  TRANSCRIPT_DELETE_FAILED_MESSAGE,
  TRANSCRIPT_READ_FAILED_MESSAGE,
  TRANSCRIPTS_LOAD_FAILED_MESSAGE,
  TranscriptTableMissingError,
} = await import("./transcripts");

/** DB につながらないときの失敗（PostgreSQL の connection_failure）。0件や表の未作成とは別物 */
const DOWN = { code: "08006", message: "connection failure" };
/** uuid の形でない id を渡したときの失敗。どの行にも当たらないので 0件と同じ扱い */
const MALFORMED_ID = { code: "22P02", message: "invalid input syntax for type uuid" };

const SCOPE = { userId: "u1", orgId: "org_1" };
const OTHER = { userId: "u2", orgId: "org_2" };
const SECRET = "宮本さんより、入浴の回数について相談があった。";

const rowFor = (encrypted: string) => ({
  id: "t1",
  client_id: "c1",
  kind: "meeting",
  title: "9月17日 会議",
  chars: SECRET.length,
  created_at: "2026-09-17T00:00:00Z",
  retention_until: "2031-09-17T00:00:00Z",
  text_encrypted: encrypted,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CARENOTE_PII_KEY = Buffer.alloc(32, 7).toString("base64");
  calls.inserted = null;
  calls.deleted = [];
  calls.selectError = null;
  calls.insertError = null;
  calls.deleteError = null;
  calls.deletedCount = 1;
  calls.rows = [];
  calls.row = { ...rowFor("dummy") };
  clients.getClientById.mockResolvedValue({ id: "c1", code: "A" });
});

const save = () =>
  saveTranscript({
    clientId: "c1",
    kind: "meeting",
    title: "9月17日 会議",
    text: SECRET,
    userId: SCOPE.userId,
    scope: SCOPE,
  });

describe("保存: saveTranscript", () => {
  it("利用者が見えない人は保存できない（DBにも触らない）", async () => {
    clients.getClientById.mockResolvedValue(null);
    const result = await save();
    expect(result).toEqual({ ok: false, reason: "client_not_visible" });
    expect(calls.inserted).toBeNull();
  });

  it("本文は必ず暗号化して入れる（平文をそのまま入れない）", async () => {
    await save();
    const stored = calls.inserted?.text_encrypted as string;
    expect(stored).toBeTypeOf("string");
    expect(stored).not.toContain("宮本");
    expect(stored).not.toBe(SECRET);
    // 同じ鍵で元に戻せる
    expect(decryptString(stored, getPiiKey())).toBe(SECRET);
  });

  it("同じ本文でも毎回ちがう暗号文になる（使い回しを見破られない）", async () => {
    await save();
    const first = calls.inserted?.text_encrypted as string;
    await save();
    const second = calls.inserted?.text_encrypted as string;
    expect(first).not.toBe(second);
  });

  it("事業所と作成者を、渡された範囲から入れる", async () => {
    await save();
    expect(calls.inserted?.org_id).toBe(SCOPE.orgId);
    expect(calls.inserted?.created_by).toBe(SCOPE.userId);
    expect(calls.inserted?.client_id).toBe("c1");
  });

  it("文字数は平文の長さで入れる（復号せずに長さが分かるように）", async () => {
    await save();
    expect(calls.inserted?.chars).toBe(SECRET.length);
  });

  it("保存期限は5年後になる", async () => {
    await save();
    const until = new Date(String(calls.inserted?.retention_until));
    const years = (until.getTime() - Date.now()) / (365.25 * 24 * 3600 * 1000);
    expect(years).toBeGreaterThan(4.9);
    expect(years).toBeLessThan(5.1);
  });

  it("表が未作成なら、専用のエラーを投げる（「権限がありません」と誤配しない）", async () => {
    calls.insertError = { code: "PGRST205", message: "Could not find the table" };
    await expect(save()).rejects.toBeInstanceOf(TranscriptTableMissingError);
  });

  it("表の未作成以外の失敗は、失敗として返す（見えない利用者と取り違えない）", async () => {
    calls.insertError = { code: "23505", message: "duplicate" };
    await expect(save()).resolves.toEqual({ ok: false, reason: "failed" });
  });
});

describe("一覧: getTranscriptsByClient", () => {
  it("利用者が見えない人には空を返す", async () => {
    clients.getClientById.mockResolvedValue(null);
    expect(await getTranscriptsByClient("c1", OTHER)).toEqual([]);
  });

  it("見える人には一覧を返す（本文は含めない）", async () => {
    calls.rows = [rowFor("enc")];
    const list = await getTranscriptsByClient("c1", SCOPE);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("t1");
    expect(JSON.stringify(list)).not.toContain("text");
  });

  it("可視性の判定には、渡された範囲をそのまま使う", async () => {
    await getTranscriptsByClient("c1", SCOPE);
    expect(clients.getClientById).toHaveBeenCalledWith("c1", SCOPE);
  });

  it("表が未作成なら専用のエラーを投げる", async () => {
    calls.selectError = { code: "42P01", message: "undefined_table" };
    await expect(getTranscriptsByClient("c1", SCOPE)).rejects.toBeInstanceOf(
      TranscriptTableMissingError,
    );
  });

  it("一覧を DB から読めなければ投げる（空の一覧に見せない ── 2026-09-24 検収の指摘）", async () => {
    calls.selectError = DOWN;
    const err = await getTranscriptsByClient("c1", SCOPE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbAccessError);
    expect((err as InstanceType<typeof DbAccessError>).publicMessage).toBe(
      TRANSCRIPTS_LOAD_FAILED_MESSAGE,
    );
  });
});

describe("本文を読む: getTranscriptText", () => {
  it("行が見つかっても、親の利用者が見えなければ本文を返さない", async () => {
    const { encryptString } = await import("@/lib/privacy/crypto");
    calls.row = rowFor(encryptString(SECRET, getPiiKey()));
    clients.getClientById.mockResolvedValue(null);
    expect(await getTranscriptText("t1", OTHER)).toBeNull();
  });

  it("見える人には復号して返す", async () => {
    const { encryptString } = await import("@/lib/privacy/crypto");
    calls.row = rowFor(encryptString(SECRET, getPiiKey()));
    const found = await getTranscriptText("t1", SCOPE);
    expect(found?.text).toBe(SECRET);
    expect(found?.summary.id).toBe("t1");
  });

  it("行の親の利用者で判定する（要求者の言い値ではない）", async () => {
    const { encryptString } = await import("@/lib/privacy/crypto");
    calls.row = { ...rowFor(encryptString(SECRET, getPiiKey())), client_id: "c-other" };
    await getTranscriptText("t1", SCOPE);
    expect(clients.getClientById).toHaveBeenCalledWith("c-other", SCOPE);
  });

  it("行が無ければ null（0件はエラーにしない maybeSingle で読む）", async () => {
    calls.row = null;
    expect(await getTranscriptText("t1", SCOPE)).toBeNull();
    expect(clients.getClientById).not.toHaveBeenCalled();
  });

  it("id が uuid の形でなければ null（どの行にも当たらない）", async () => {
    calls.selectError = MALFORMED_ID;
    expect(await getTranscriptText("not-a-uuid", SCOPE)).toBeNull();
  });

  it("行を DB から読めなければ投げる（「見つかりませんでした」と答えない ── 2026-09-24 検収の指摘）", async () => {
    calls.selectError = DOWN;
    const err = await getTranscriptText("t1", SCOPE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbAccessError);
    expect((err as InstanceType<typeof DbAccessError>).publicMessage).toBe(
      TRANSCRIPT_READ_FAILED_MESSAGE,
    );
    expect(clients.getClientById).not.toHaveBeenCalled();
  });

  it("鍵が違えば復号で例外になる（黙って空を返さない）", async () => {
    const { encryptString } = await import("@/lib/privacy/crypto");
    calls.row = rowFor(encryptString(SECRET, getPiiKey()));
    process.env.CARENOTE_PII_KEY = Buffer.alloc(32, 9).toString("base64");
    await expect(getTranscriptText("t1", SCOPE)).rejects.toBeTruthy();
  });
});

/**
 * 親の利用者を DB から読めなかったとき（2026-09-24 検収の指摘）。
 * getClientById は ClientLookupError を投げるので、ここで握って「見えない」と答えない。
 * 入口（app/api/transcripts/*）が 503 と職員向けの文言にする。
 */
describe("親の利用者を DB から読めなかったとき", () => {
  const lookupFailed = () => clients.getClientById.mockRejectedValue(new ClientLookupError("down"));

  it("保存は投げる（client_not_visible と答えない・DBにも書かない）", async () => {
    lookupFailed();
    await expect(save()).rejects.toBeInstanceOf(ClientLookupError);
    expect(calls.inserted).toBeNull();
  });

  it("一覧は投げる（空の一覧に見せない）", async () => {
    lookupFailed();
    await expect(getTranscriptsByClient("c1", SCOPE)).rejects.toBeInstanceOf(ClientLookupError);
  });

  it("本文を読むときは投げる（見つからないと答えない）", async () => {
    lookupFailed();
    await expect(getTranscriptText("t1", SCOPE)).rejects.toBeInstanceOf(ClientLookupError);
  });

  it("消すときは投げる（消さない・見つからないと答えない）", async () => {
    lookupFailed();
    await expect(deleteTranscript("t1", SCOPE)).rejects.toBeInstanceOf(ClientLookupError);
    expect(calls.deleted).toEqual([]);
  });
});

describe("消す: deleteTranscript", () => {
  it("親の利用者が見えない人には消させない", async () => {
    clients.getClientById.mockResolvedValue(null);
    expect(await deleteTranscript("t1", OTHER)).toBe(false);
    expect(calls.deleted).toEqual([]);
  });

  it("見える人は消せる", async () => {
    expect(await deleteTranscript("t1", SCOPE)).toBe(true);
    expect(calls.deleted).toEqual(["t1"]);
  });

  it("行が無ければ消さない", async () => {
    // maybeSingle では0件はエラーでなく data が null（以前は single() の PGRST116 を偽っていた）
    calls.row = null;
    expect(await deleteTranscript("t1", SCOPE)).toBe(false);
    expect(calls.deleted).toEqual([]);
  });

  it("id が uuid の形でなければ消さずに false（どの行にも当たらない）", async () => {
    calls.selectError = MALFORMED_ID;
    expect(await deleteTranscript("not-a-uuid", SCOPE)).toBe(false);
    expect(calls.deleted).toEqual([]);
  });

  it("行を DB から読めなければ投げて消さない（false＝もう無い、と答えない ── 2026-09-24 検収の指摘）", async () => {
    calls.selectError = DOWN;
    const err = await deleteTranscript("t1", SCOPE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbAccessError);
    expect((err as InstanceType<typeof DbAccessError>).publicMessage).toBe(
      TRANSCRIPT_DELETE_FAILED_MESSAGE,
    );
    expect(calls.deleted).toEqual([]);
  });

  it("消す操作そのものが失敗したら投げる（消えていないのに false と答えない）", async () => {
    calls.deleteError = DOWN;
    const err = await deleteTranscript("t1", SCOPE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbAccessError);
    expect((err as InstanceType<typeof DbAccessError>).publicMessage).toBe(
      TRANSCRIPT_DELETE_FAILED_MESSAGE,
    );
  });

  it("消す間際に他の人が消していたら false（消えた行が0件）", async () => {
    calls.deletedCount = 0;
    expect(await deleteTranscript("t1", SCOPE)).toBe(false);
  });

  it("表が未作成なら専用のエラーを投げる", async () => {
    calls.selectError = { code: "PGRST205", message: "missing" };
    await expect(deleteTranscript("t1", SCOPE)).rejects.toBeInstanceOf(TranscriptTableMissingError);
  });
});
