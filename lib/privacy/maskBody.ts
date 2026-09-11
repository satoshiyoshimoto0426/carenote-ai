/**
 * リクエスト本文（複数の文字列フィールド）をまとめて黒塗りする。純粋ロジック。
 *
 * なぜ存在するか:
 *   /api/generate（AIへ送る）と /api/preview（送らずに見せる）が同じ黒塗りを通らないと、
 *   画面で見せた文章とAIに送る文章がずれる。ここ1か所を両方が呼ぶ（docs/specs/call-pipeline.md §2.1）。
 *   件数は種類ごとに合算し、原文は持たない。
 *
 * maskDeep（独立審査 2026-09-11 critical #7）:
 *   /api/generate が二枚方式で実値に戻した帳票（draft）を、後段の API（/api/kaipoke/assessment 等）が
 *   再び AI へ送る経路がある。入れ子の JSON をそのまま渡すと黒塗りも漏れ検査も通らないため、
 *   restoreDeep の逆＝入れ子の文字列すべてに maskPii をかける関数をここに置く。
 */
import { maskPii } from "./maskPii";
import type { PatternFinding, PiiKind } from "./patterns";
import type { NameAlias } from "./pseudonymize";
import type { PiiVault } from "./vault";

export interface MaskedBody {
  /** 黒塗り後の本文（文字列以外・skipKeys はそのまま） */
  body: Record<string, unknown>;
  /** 黒塗り後の文字列フィールドだけ（画面表示用） */
  fields: Record<string, string>;
  findings: { names: number; patterns: PatternFinding[] };
}

export function maskRequestBody(
  body: Record<string, unknown>,
  aliases: NameAlias[],
  vault: PiiVault,
  skipKeys: string[] = ["documentType"],
): MaskedBody {
  const out: Record<string, unknown> = { ...body };
  const fields: Record<string, string> = {};
  let names = 0;
  const byKind = new Map<PiiKind, number>();

  for (const [key, value] of Object.entries(body)) {
    if (skipKeys.includes(key) || typeof value !== "string") continue;
    const r = maskPii(value, aliases, vault);
    out[key] = r.text;
    fields[key] = r.text;
    names += r.findings.names;
    for (const f of r.findings.patterns) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + f.count);
  }

  const patterns = [...byKind.entries()].map(([kind, count]) => ({ kind, count }));
  return { body: out, fields, findings: { names, patterns } };
}

/**
 * 入れ子の JSON（帳票の下書きなど）の文字列をすべて黒塗りする。
 * 実名や型が残っていれば maskPii が PiiLeakError を投げる（fail-closed）。文字列以外はそのまま。
 */
export function maskDeep<T>(value: T, aliases: NameAlias[], vault: PiiVault): T {
  if (typeof value === "string") return maskPii(value, aliases, vault).text as T;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, aliases, vault)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = maskDeep(v, aliases, vault);
    }
    return out as T;
  }
  return value;
}
