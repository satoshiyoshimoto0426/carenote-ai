/**
 * app/globals.css を読むセンサー（テスト）用の、小さな CSS 読み取り器と色の計算。**テスト専用**。
 *
 * なぜ存在するか:
 *   globals.css を読むテストが2本ある ── `app/globals.test.ts`（層の外の規則・文字色のコントラスト・
 *   書体の読み込み）と `lib/clerkAppearance.test.ts`（Clerk の見た目の16進数がトークンとずれていないか）。
 *   読み方が2通りあると、片方だけ直して片方が黙って外れる。だから読み方はここ1か所に置く。
 *
 * なぜ本番コードから使わないか:
 *   Clerk は CSS 変数を解釈しない箇所があるため、Clerk の見た目は lib/clerkAppearance.ts に
 *   実際の16進数で持つ（実行時に CSS を読む作りにはしない）。ずれは上のテストで止める。
 *
 * 限界（知ったうえで使う）: 本物の CSS パーサーではない。コメントは消し、引用符の中の
 * `{` `}` `;` は数えないが、エスケープされた引用符や入れ子の書き方（CSS Nesting）の解釈はしない。
 */

/** 波かっこ1組ぶんのまとまり（規則・@media・@layer など）。 */
export interface CssNode {
  /** `{` の前に書かれたもの（選択子、または `@media (…)` などの前置き） */
  prelude: string;
  /** そのまとまり直下の宣言（`margin: 0;` など）。子のまとまりの中身は含まない */
  declarations: string;
  /** 直下に入れ子になったまとまり */
  children: CssNode[];
}

/**
 * CSS を波かっこのまとまりの木に分ける。
 *
 * `;` で終わる文（`@import "tailwindcss";` / `@layer theme, base;` など）は、次の規則の
 * 選択子に混ざらないよう、その場で区切る。以前の読み方はここを区切らず、`@layer a, b;` の
 * 直後にある層の外の規則を「層の中」と見誤っていた（2026-09-23 に塞いだ穴）。
 */
export function parseCss(css: string): CssNode[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const root: CssNode = { prelude: "", declarations: "", children: [] };
  const stack: CssNode[] = [root];
  let buf = "";
  let quote: string | null = null;
  for (const ch of text) {
    const top = stack[stack.length - 1];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === "{") {
      const node: CssNode = { prelude: buf.trim(), declarations: "", children: [] };
      top.children.push(node);
      stack.push(node);
      buf = "";
      continue;
    }
    if (ch === ";") {
      top.declarations += `${buf};`;
      buf = "";
      continue;
    }
    if (ch === "}") {
      top.declarations += buf;
      buf = "";
      if (stack.length > 1) stack.pop();
      continue;
    }
    buf += ch;
  }
  return root.children;
}

/**
 * 最上位の `:root { … }` に書かれたカスタムプロパティ（`--ink` など）を名前→値で返す。
 * `:root` が複数あれば後ろが勝つ（CSS と同じ）。1つも無ければ例外 ── 読めないまま緑にしないため。
 */
export function rootTokens(css: string): Record<string, string> {
  const roots = parseCss(css).filter((n) => n.prelude === ":root");
  if (roots.length === 0) throw new Error("globals.css に最上位の :root が見つかりません");
  const tokens: Record<string, string> = {};
  for (const node of roots) {
    for (const decl of node.declarations.split(";")) {
      const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(decl);
      if (m) tokens[m[1]] = m[2].replace(/\s+/g, " ");
    }
  }
  return tokens;
}

/**
 * トークンの色を `#rrggbb`（小文字）で返す。`var(--other)` は辿る。
 * 16進数でない値（rgb() など）は例外にする ── 計算できない色を「合格」と扱わないため。
 */
export function resolveColor(tokens: Record<string, string>, name: string, depth = 0): string {
  const value = tokens[name];
  if (value === undefined) throw new Error(`トークン ${name} が :root にありません`);
  const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value);
  if (ref) {
    if (depth > 5) throw new Error(`トークン ${name} の var() が深すぎます（循環の疑い）`);
    return resolveColor(tokens, ref[1], depth + 1);
  }
  const hex = normalizeHex(value);
  if (!hex) throw new Error(`トークン ${name} の値「${value}」は16進数の色として読めません`);
  return hex;
}

/** `#abc` / `#AABBCC` を `#aabbcc` にそろえる。色でなければ null。 */
export function normalizeHex(value: string): string | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return h.length === 3 ? `#${[...h].map((c) => c + c).join("")}` : `#${h}`;
}

/** WCAG 2.x の相対輝度（sRGB の各チャンネルを線形に戻して重み付けする）。 */
function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/**
 * 2色のコントラスト比（WCAG 2.x・1〜21）。本文の文字は 4.5 以上が AA の基準。
 * 使い道: app/globals.test.ts が「文字に使う色トークンが地の色の上で読めるか」を確かめる。
 */
export function contrastRatio(a: string, b: string): number {
  const ha = normalizeHex(a);
  const hb = normalizeHex(b);
  if (!ha || !hb) throw new Error(`16進数の色ではありません: ${a} / ${b}`);
  const la = relativeLuminance(ha);
  const lb = relativeLuminance(hb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
