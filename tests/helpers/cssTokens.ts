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

/**
 * CSS のコメント（スラッシュとアスタリスクで囲んだ部分）を消す。
 * なぜ: globals.css の説明コメントには `@layer base` のような文字列そのものが書かれている。
 * 消さずに探すと、説明文を本物の宣言と取り違える。
 * 使う場所: この下の parseCss・layerOrderStatement と、lib/clerkAppearance.test.ts
 * （`@import "tailwindcss"` の位置を、コメントの中の文字を数えずに探す）。
 */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * 層の順番を決める文（`@layer theme, base, clerk;` のように、中身を持たず名前を並べるだけの文）を、
 * ファイルの中で最初に書かれたものについて返す。無ければ null。
 *
 * なぜ「最初の1つ」か: CSS の層の順番は、**その層の名前が初めて出てきた順**で決まる
 * （後から同じ名前を並べ直しても順番は変わらない）。だから効くのは最初の宣言だけ。
 * 使い道: lib/clerkAppearance.test.ts が「Clerk の層が base の後・utilities の前にあるか」を確かめる。
 *
 * @returns names=並んだ層の名前、index=コメントを消した文字列の中での位置、
 *   firstLayerIndex=`@layer` という語が最初に出てくる位置（この文より前に別の層の宣言が無いかを見るため）
 */
export function layerOrderStatement(
  css: string,
): { names: string[]; index: number; firstLayerIndex: number } | null {
  const text = stripCssComments(css);
  const m = /@layer\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s*;/.exec(text);
  if (!m) return null;
  return {
    names: m[1].split(",").map((s) => s.trim()),
    index: m.index,
    firstLayerIndex: text.search(/@layer\b/),
  };
}

/**
 * 波かっこ1組ぶんのまとまり（規則・@media・@layer など）。parseCss が返す木の1つの節。
 * なぜ木にするか: 「層（@layer）の外か」は、どのまとまりの中にあるかでしか決まらない。以前の読み方は
 * 最上位の段しか見ず、@media の中を見落とし、`@layer a, b;` の直後の規則を層の中と見誤った（2026-09-23）。
 * 使う場所: app/globals.test.ts の unlayeredRules（層の外の規則を @media の中まで降りて集める）と、
 * この下の rootTokens（最上位の `:root` を探す）。
 */
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
 * なぜ: globals.css を読む検査（層の外の余白・トークンの値）が、同じ1つの読み方を使うため。
 * 読み方が検査ごとに違うと、片方だけ直して片方が黙って外れる。
 * 使う場所: app/globals.test.ts（層の外の余白の規則を探す）と、この下の rootTokens（トークンを読む）。
 *
 * `;` で終わる文（`@import "tailwindcss";` / `@layer theme, base;` など）は、次の規則の
 * 選択子に混ざらないよう、その場で区切る。以前の読み方はここを区切らず、`@layer a, b;` の
 * 直後にある層の外の規則を「層の中」と見誤っていた（2026-09-23 に塞いだ穴）。
 */
export function parseCss(css: string): CssNode[] {
  const text = stripCssComments(css);
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
 * なぜ: トークンの値の正本は globals.css の :root だけ。テストが値を書き写して持つと、写しがずれる。
 * 使う場所: app/globals.test.ts（文字色のコントラスト・--sans / --mono の書体の読み込み）と
 * lib/clerkAppearance.test.ts（Clerk の見た目の16進数・書体がトークンとずれていないか）。
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
 * なぜ var() を辿るか: `--x: var(--green)` のような別名のトークンも、実際に画面に出る色で比べるため。
 * 使う場所: app/globals.test.ts（文字色と地の色のコントラスト）と
 * lib/clerkAppearance.test.ts（Clerk の色の変数が、対応するトークンと同じ16進数か）。
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

/**
 * `#abc` / `#AABBCC` を `#aabbcc` にそろえる。色でなければ null。
 * なぜ: 同じ色でも書き方（大文字・3桁）が違うと、文字列の比較ではずれと誤判定する。
 * null を返すのは、書体や大きさなど色でない値を「色ではない」と見分けるため。
 * 使う場所: この下の resolveColor・contrastRatio と、lib/clerkAppearance.test.ts
 * （Clerk の16進数とトークンの突き合わせ・elements に書いた色がトークンにあるか）。
 */
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
 * なぜ: テストは文字を見るが色は見ない。地に溶けて読めない文字（A案の原案の --faint #a9b0b7 は約 2:1）でも
 * 緑のままになるので、比を数で出して縛る。
 * 使い道:app/globals.test.ts が「文字に使う色トークンが地の色の上で読めるか」を確かめる。
 */
export function contrastRatio(a: string, b: string): number {
  const ha = normalizeHex(a);
  const hb = normalizeHex(b);
  if (!ha || !hb) throw new Error(`16進数の色ではありません: ${a} / ${b}`);
  const la = relativeLuminance(ha);
  const lb = relativeLuminance(hb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
