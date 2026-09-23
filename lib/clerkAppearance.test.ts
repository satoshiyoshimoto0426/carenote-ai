import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clerkAppearance } from "@/lib/clerkAppearance";
import { normalizeHex, resolveColor, rootTokens } from "@/tests/helpers/cssTokens";

/**
 * Clerk の見た目（lib/clerkAppearance.ts）が app/globals.css のトークンとずれていないかを見張る。
 *
 * なぜ必要か:
 *   Clerk は CSS 変数を解釈しない箇所があるので、clerkAppearance.ts はトークンの値を16進数で
 *   写して持つ。写しは片方だけ直すと黙ってずれる ── 実際に v1（2026-09-16）で --sans を
 *   Noto Sans JP にしたとき、Clerk だけ Hiragino のまま取り残された。
 *   A案（2026-09-23）でトークンの値をほぼ全部替えるので、ここで機械的に突き合わせる。
 */

const TOKENS = rootTokens(readFileSync(join(process.cwd(), "app", "globals.css"), "utf8"));

/** Clerk の色の変数と、写し元のトークン。新しい色の変数を足したらここにも足す（足さないと落ちる）。 */
const VARIABLE_TOKEN: Record<string, string> = {
  colorBackground: "--card",
  colorText: "--ink",
  colorTextSecondary: "--muted",
  colorPrimary: "--green",
  colorInputBackground: "--card",
  colorInputText: "--ink",
  colorDanger: "--clay",
  colorSuccess: "--green",
  colorWarning: "--amber",
};

/** 空白の違いだけのずれは同じとみなす（書き方の揺れで落とさない）。 */
function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

describe("Clerk の見た目が globals.css のトークンとずれない", () => {
  const variables: Record<string, unknown> = { ...(clerkAppearance.variables ?? {}) };

  it("色の変数は、対応するトークンと同じ16進数", () => {
    const drift: string[] = [];
    for (const [key, token] of Object.entries(VARIABLE_TOKEN)) {
      const raw = variables[key];
      const actual = typeof raw === "string" ? normalizeHex(raw) : null;
      const expected = resolveColor(TOKENS, token);
      if (actual !== expected) drift.push(`${key}=${String(raw)} / ${token}=${expected}`);
    }
    expect(drift).toEqual([]);
  });

  it("16進数の色の変数は、すべて対応表（VARIABLE_TOKEN）に載っている", () => {
    const unmapped = Object.entries(variables)
      .filter(([, v]) => typeof v === "string" && normalizeHex(v) !== null)
      .map(([k]) => k)
      .filter((k) => !(k in VARIABLE_TOKEN));
    expect(unmapped).toEqual([]);
  });

  it("書体は --sans と同じ並び", () => {
    expect(squash(String(variables.fontFamily ?? ""))).toBe(squash(TOKENS["--sans"] ?? ""));
  });

  it("部品ごとの見た目（elements）に書いた16進数は、どれもトークンのどれかと同じ値", () => {
    // 色のトークンだけを集める（書体・文字の大きさ・余白は16進数として読めないので入らない）
    const tokenColors = new Set(
      Object.values(TOKENS)
        .map((v) => normalizeHex(v))
        .filter((hex): hex is string => hex !== null),
    );
    const used = JSON.stringify(clerkAppearance.elements ?? {}).match(/#[0-9a-fA-F]{3,6}\b/g) ?? [];
    // 空振り防止: 1つも拾えないなら、この検査自体が何も見ていない
    expect(used.length).toBeGreaterThan(0);
    const stray = used.filter((hex) => !tokenColors.has(normalizeHex(hex) ?? hex));
    expect(stray).toEqual([]);
  });
});
