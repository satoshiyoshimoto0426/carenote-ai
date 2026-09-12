import { decryptString, encryptString, getPiiKey } from "@/lib/privacy/crypto";
import {
  expandAliasVariants,
  type NameAlias,
  nextClientCode,
  relatedAliasCode,
} from "@/lib/privacy/pseudonymize";
import type { ClientAttributes, ClientInput, ClientRecord } from "@/types/client";
import { createServerClient } from "../supabase/server";

/**
 * 利用者(clients)のデータアクセス。機能仕様 §6/§8。
 * 既存 lib/db.ts と同方式：サーバ専用クライアント(service role)＋アプリ層で created_by スコープ。
 * 実名は client_identities に暗号化保存し、Claude へは渡さない。
 */

/**
 * 読み書きの範囲（G3b・2026-09-12 吉本さん決定「事業所で共有します」）。
 *
 * なぜ必要か:
 *   黒塗りは名簿にある名前しか消せない。名簿が「登録した職員本人」の中だけで効くと、
 *   職員Bが職員Aの登録した利用者の実名をメモに書いたとき、置換も漏れ検査も反応せず
 *   実名がそのまま AI へ出る（docs/ROADMAP.md G3b / Issue #13）。
 *
 * 決め方:
 *   - Clerk の組織に所属していれば（orgId あり）**事業所の行**を対象にする
 *   - 所属していなければ（orgId なし）従来どおり**自分の行だけ**
 *   - 組織に入る前に自分が作った行（org_id が null）は、自分には引き続き見える
 *   org_id が null 同士を「同じ事業所」とみなすことはしない（将来テナントが増えたとき全員が混ざるため）。
 */
export interface DataScope {
  userId: string;
  orgId: string | null;
}

/** Clerk の id は英数字・_・- のみ。想定外の文字は絞り込み式（or）を壊すので弾く。 */
function isSafeId(v: string): boolean {
  return /^[A-Za-z0-9_-]{1,128}$/.test(v);
}

/**
 * 絞り込みの式を1か所で作る。読み出し系はすべて `.or(scopeExpr(scope))` を通す
 * （片方だけ直して穴が開くのを防ぐ）。
 *   - 事業所に所属している: 事業所の行 ＋ 組織に入る前に自分が作った行
 *   - 所属していない: 自分の行だけ
 * userId が想定外の形なら例外にする（絞り込みが外れて他人の行が混ざるより止める方が安全）。
 */
export function scopeExpr(scope: DataScope): string {
  const { userId, orgId } = scope;
  if (!isSafeId(userId)) throw new Error("invalid userId");
  if (orgId && isSafeId(orgId)) {
    return `org_id.eq.${orgId},and(org_id.is.null,created_by.eq.${userId})`;
  }
  return `created_by.eq.${userId}`;
}

interface ClientRow {
  id: string;
  org_id: string | null;
  code: string;
  attributes: ClientAttributes;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function toRecord(r: ClientRow): ClientRecord {
  return {
    id: r.id,
    orgId: r.org_id,
    code: r.code,
    attributes: r.attributes ?? {},
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** 利用者を作成する。記号(code)を自動採番し、実名があれば暗号化して別テーブルに保存する。 */
export async function createClientRecord(params: {
  userId: string;
  orgId: string | null;
  input: ClientInput;
}): Promise<ClientRecord | null> {
  const db = createServerClient();
  // 記号（A様・B様…）は**名簿を共有する範囲で**一意でなければならない。
  // 職員ごとに採番すると、事業所で共有した瞬間に別人が同じ「A様」になり、黒塗りが取り違える。
  const { count } = await db
    .from("clients")
    .select("id", { count: "exact", head: true })
    .or(scopeExpr({ userId: params.userId, orgId: params.orgId }));
  const code = nextClientCode(count ?? 0);

  const { data, error } = await db
    .from("clients")
    .insert({
      org_id: params.orgId,
      code,
      attributes: params.input.attributes ?? {},
      created_by: params.userId,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[db] createClientRecord error:", error?.message);
    return null;
  }
  const row = data as ClientRow;

  const name = params.input.name?.trim();
  if (name) {
    const { error: idErr } = await db.from("client_identities").insert({
      client_id: row.id,
      org_id: params.orgId,
      name_encrypted: encryptString(name, getPiiKey()),
      created_by: params.userId,
    });
    if (idErr) console.error("[db] createClientRecord identity error:", idErr.message);
  }
  return toRecord(row);
}

/** 利用者の一覧（事業所に所属していれば事業所ぶん・していなければ自分ぶん）。 */
export async function getClients(scope: DataScope): Promise<ClientRecord[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("clients")
    .select("*")
    .or(scopeExpr(scope))
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[db] getClients error:", error.message);
    return [];
  }
  return (data as ClientRow[]).map(toRecord);
}

/** 利用者を1件取得（範囲チェック込み）。 */
export async function getClientById(id: string, scope: DataScope): Promise<ClientRecord | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("clients")
    .select("*")
    .eq("id", id)
    .or(scopeExpr(scope))
    .single();
  if (error || !data) return null;
  return toRecord(data as ClientRow);
}

/**
 * 名簿が読めなかった時に投げる。呼び出し側（API）は 503 にして**送信を中止**する。
 * なぜ: 名簿なしで進むと実名が消えないまま AI へ出る（fail-open）。2026-09-09 の実機で
 * Supabase が一時的に "JWT issued at future" を返し、名簿が空のまま進んだ実例があった。
 */
export class AliasLoadError extends Error {
  constructor(detail: string, publicMessage?: string) {
    super(
      publicMessage ??
        "利用者名簿を読み込めなかったため送信を中止しました。少し待ってからもう一度お試しください。",
    );
    this.name = "AliasLoadError";
    console.error("[db] getClientAliases failed:", detail);
  }
}

/**
 * 関係者名簿の表（client_related_identities）が未作成の環境で投げる内部エラー。
 * PostgREST は未定義の表に対し code "42P01"（PostgreSQL undefined_table）または "PGRST205" を返す。
 * これも送信は止める（独立審査 2026-09-11 critical #3: 黙って進むと家族名が消えないまま AI へ出る）。
 * 文言だけ「管理者が SQL を適用する」案内に変える。
 */
class RelatedTableMissingError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "RelatedTableMissingError";
  }
}
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);

/** 職員に見せる文言（関係者名簿の表が無い時） */
export const RELATED_TABLE_MISSING_MESSAGE =
  "関係者名簿の表が未作成のため送信を中止しました。管理者が supabase/client_related.sql を Supabase で実行してください。";

/** 読み直しまでの待ち時間（テストでは短くする） */
const RETRY_DELAY_MS = process.env.VITEST ? 1 : 500;

/**
 * ログインユーザーの全利用者について「実名⇄記号」の対応表を返す（仮名化用・サーバ専用）。
 * AIへ送る前の実名マスキング（maskPii）に使う。復号できない行はスキップ。
 * 対応表が作れない場合は AliasLoadError を投げ、呼び出し側が送信を止める（fail-closed）。
 * 旧仕様「空配列を返して生成は止めない」は 2026-09-09 に廃止（実名が消えないまま送られる穴）。
 */
export async function getClientAliases(scope: DataScope): Promise<NameAlias[]> {
  // 一時的な失敗（ネットワーク・ゲートウェイの揺らぎ）は1回だけ読み直す
  try {
    return await loadAliases(scope);
  } catch (first) {
    // 表が無いのは待っても直らないので読み直さない
    if (first instanceof RelatedTableMissingError) {
      throw new AliasLoadError(first.message, RELATED_TABLE_MISSING_MESSAGE);
    }
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    try {
      return await loadAliases(scope);
    } catch (second) {
      const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
      if (second instanceof RelatedTableMissingError) {
        throw new AliasLoadError(second.message, RELATED_TABLE_MISSING_MESSAGE);
      }
      throw new AliasLoadError(`${msg(first)} / retry: ${msg(second)}`);
    }
  }
}

async function loadAliases(scope: DataScope): Promise<NameAlias[]> {
  const db = createServerClient();
  const [clientsRes, idsRes, relRes] = await Promise.all([
    db.from("clients").select("id, code").or(scopeExpr(scope)),
    db.from("client_identities").select("client_id, name_encrypted").or(scopeExpr(scope)),
    // 関係者名簿（D4）。読めなければ利用者名簿と同じく送信を止める（警告で続行しない）
    db
      .from("client_related_identities")
      .select("client_id, relation, name_encrypted")
      .or(scopeExpr(scope)),
  ]);
  if (clientsRes.error || idsRes.error) {
    throw new Error(clientsRes.error?.message ?? idsRes.error?.message ?? "unknown");
  }
  if (relRes.error) {
    const code = (relRes.error as { code?: string }).code ?? "";
    if (MISSING_TABLE_CODES.has(code)) {
      throw new RelatedTableMissingError(`related table missing: ${relRes.error.message}`);
    }
    throw new Error(`client_related_identities: ${relRes.error.message}`);
  }
  const codeById = new Map(
    (clientsRes.data as { id: string; code: string }[]).map((c) => [c.id, c.code]),
  );
  const key = getPiiKey();
  const aliases: NameAlias[] = [];
  for (const row of idsRes.data as { client_id: string; name_encrypted: string }[]) {
    const code = codeById.get(row.client_id);
    if (!code) continue;
    try {
      aliases.push({ real: decryptString(row.name_encrypted, key), code: `${code}様` });
    } catch {
      // 復号失敗行はスキップ（鍵ローテーション時など）
    }
  }
  for (const row of (relRes.data ?? []) as {
    client_id: string;
    relation: string;
    name_encrypted: string;
  }[]) {
    const code = codeById.get(row.client_id);
    if (!code) continue;
    try {
      aliases.push({
        real: decryptString(row.name_encrypted, key),
        code: relatedAliasCode(code, row.relation),
      });
    } catch {
      // 復号失敗行はスキップ
    }
  }
  return expandAliasVariants(aliases);
}

// ---- 関係者名簿（D4・2026-09-10）: 家族・担当者・主治医などを利用者ごとに登録し、黒塗りの対象にする ----

export interface RelatedPerson {
  id: string;
  clientId: string;
  relation: string;
  /** 実名（権限内の画面表示用。AIへは渡さない） */
  name: string;
  createdAt: string;
}

interface RelatedRow {
  id: string;
  client_id: string;
  relation: string;
  name_encrypted: string;
  created_at: string;
}

/** 利用者の関係者一覧（所有者チェック込み・実名は復号して返す）。 */
export async function getRelatedPeople(
  clientId: string,
  scope: DataScope,
): Promise<RelatedPerson[]> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_related_identities")
    .select("id, client_id, relation, name_encrypted, created_at")
    .eq("client_id", clientId)
    .or(scopeExpr(scope))
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[db] getRelatedPeople error:", error.message);
    return [];
  }
  const key = getPiiKey();
  const out: RelatedPerson[] = [];
  for (const r of data as RelatedRow[]) {
    try {
      out.push({
        id: r.id,
        clientId: r.client_id,
        relation: r.relation,
        name: decryptString(r.name_encrypted, key),
        createdAt: r.created_at,
      });
    } catch {
      // 復号失敗行はスキップ
    }
  }
  return out;
}

/** 関係者を追加する。同じ利用者に同じ続柄は登録できない（記号が重なるため）。 */
export async function addRelatedPerson(params: {
  clientId: string;
  userId: string;
  orgId: string | null;
  relation: string;
  name: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const relation = params.relation.replace(/[\r\n]+/g, " ").trim();
  const name = params.name.trim();
  if (!relation || !name) return { ok: false, error: "続柄と氏名を入力してください。" };
  if (relation.length > 20) return { ok: false, error: "続柄は20文字以内にしてください。" };

  const owner = await getClientById(params.clientId, {
    userId: params.userId,
    orgId: params.orgId,
  });
  if (!owner) return { ok: false, error: "利用者が見つかりません。" };

  const db = createServerClient();
  const { data, error } = await db
    .from("client_related_identities")
    .insert({
      client_id: params.clientId,
      org_id: params.orgId,
      relation,
      name_encrypted: encryptString(name, getPiiKey()),
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    const dup = /duplicate|unique/i.test(error?.message ?? "");
    console.error("[db] addRelatedPerson error:", error?.message);
    return {
      ok: false,
      error: dup
        ? `「${relation}」は既に登録されています。続柄を変えてください（例: 長女・次女）。`
        : "登録に失敗しました。",
    };
  }
  return { ok: true, id: (data as { id: string }).id };
}

/**
 * 関係者を削除する（所有者チェック込み・利用者IDでも絞る）。
 * 0件（他人の id・存在しない id・別の利用者の id）は "not_found" にして、画面に「消えた」と誤って伝えない
 * （独立審査 2026-09-11 D8）。
 */
export async function deleteRelatedPerson(
  id: string,
  clientId: string,
  scope: DataScope,
): Promise<"ok" | "not_found" | "error"> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_related_identities")
    .delete()
    .eq("id", id)
    .eq("client_id", clientId)
    .or(scopeExpr(scope))
    .select("id");
  if (error) {
    console.error("[db] deleteRelatedPerson error:", error.message);
    return "error";
  }
  return (data ?? []).length > 0 ? "ok" : "not_found";
}

/** 実名を復号して返す（権限内・必要時のみ）。失敗時は null。 */
export async function getClientName(clientId: string, scope: DataScope): Promise<string | null> {
  const db = createServerClient();
  const { data, error } = await db
    .from("client_identities")
    .select("name_encrypted")
    .eq("client_id", clientId)
    .or(scopeExpr(scope))
    .single();
  if (error || !data) return null;
  try {
    return decryptString((data as { name_encrypted: string }).name_encrypted, getPiiKey());
  } catch {
    return null;
  }
}
