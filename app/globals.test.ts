import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, parseCss, resolveColor, rootTokens } from "@/tests/helpers/cssTokens";

/**
 * 全体の CSS（app/globals.css）が画面を壊していないかを見張るセンサー。
 *
 * ① 余白を打ち消していないか（2026-09-23 に発覚した実害バグ）:
 *   Tailwind v4 の余白指定（p-4 / px-3 / space-y-4 など）は `@layer utilities` に入る。
 *   CSS の決まりで、**層に入っていない規則は、層に入った規則に詳細度と関係なく必ず勝つ**。
 *   globals.css の `* { margin: 0; padding: 0 }` が層の外にあったせいで、画面中の余白が
 *   すべて 0 になっていた。ボタンの文字は枠に貼り付き、カードの中身は縁に密着し、
 *   縦の間隔も消えて「左上にギュッと集まった」画面になっていた。
 *   ビルドもテストも緑のまま、見た目だけが壊れる種類の不具合なので、ここで機械的に止める。
 *   同日の追補: 層の外の `@media` / `@supports` の中と、`@layer a, b;` の直後は見えていなかった
 *   （A案の枠組みはメディアクエリを増やすので、そこに同じ誤りが入ると素通りした）。
 *
 * ② 文字の色が地の色の上で読めるか（A案 作業台・2026-09-23）:
 *   テストは文字を見るが色は見ない。A案の案では `--faint` を #a9b0b7（地の上で約 2:1）に
 *   変えることになっていたが、`--faint` は赤い言葉の理由「（敬称の前）」など 58 か所の本物の
 *   文字に使われている。安全のための一文が読めなくなっても、どのテストも赤くならない。
 *   だから文字に使う色トークンは、地の色の上で WCAG AA（4.5:1）以上であることをここで縛る。
 *
 * ③ 書体を実際に読み込んでいるか:
 *   2026-09-16 に「layout.tsx で Noto を読み込んでいるのに --sans が一度も使っていない」ずれが
 *   見つかった。--sans / --mono の先頭の書体を app/layout.tsx が読み込んでいることを確かめる。
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const LAYOUT = readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");

/**
 * 中に入って確かめる @ 規則。層の外に置かれた @media / @supports / @container の中の規則も
 * 層の外なので、層に入った Tailwind の余白指定に必ず勝つ。
 * それ以外の @ 規則（@layer のまとまり・@keyframes・@font-face など）は、中身が層の中か、
 * 要素に当たる規則ではないので数えない。
 */
const DESCEND = /^@(media|supports|container)\b/i;

/** 層（@layer）の外に出ている規則を、@media / @supports の中まで降りて取り出す。 */
function unlayeredRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const visit = (nodes: ReturnType<typeof parseCss>) => {
    for (const node of nodes) {
      if (node.prelude.startsWith("@")) {
        if (DESCEND.test(node.prelude)) visit(node.children);
        continue;
      }
      out.push({ selector: node.prelude, body: node.declarations });
    }
  };
  visit(parseCss(css));
  return out;
}

/** クラスや属性ではなく、要素そのもの（または全要素 *）を狙った選択子か。 */
function isElementSelector(selector: string): boolean {
  return selector
    .split(",")
    .map((s) => s.trim())
    .some((s) => /^(\*|[a-z][a-z0-9]*)(\s|$|:|::|>|\+|~|\[)/i.test(s) && !s.startsWith("."));
}

/** margin / padding と、その一部だけを決める書き方（margin-top・padding-inline など）。 */
const SPACING = /(^|;|\s)(margin|padding)(-[a-z-]+)?\s*:/;

/** 層の外で要素の余白を決めている規則の選択子（＝Tailwind の余白指定を打ち消すもの）。 */
function spacingOffenders(css: string): string[] {
  return unlayeredRules(css)
    .filter((r) => isElementSelector(r.selector) && SPACING.test(r.body))
    .map((r) => r.selector);
}

describe("全体の CSS が余白指定を打ち消さない", () => {
  it("層の外に、要素の余白（margin / padding）を決める規則を置いていない", () => {
    expect(spacingOffenders(CSS)).toEqual([]);
  });

  it("全要素のリセット（* { … }）は @layer base の中にある", () => {
    const universal = unlayeredRules(CSS).filter((r) =>
      r.selector.split(",").some((s) => s.trim() === "*"),
    );
    expect(universal).toEqual([]);
    expect(CSS).toMatch(/@layer base\s*\{[\s\S]*?\*\s*\{/);
  });

  it("検査そのものが壊れていない（層の外の悪い例を実際に見つけられる）", () => {
    const bad = "* { margin: 0; padding: 0; }\n.ok { padding: 4px; }";
    expect(spacingOffenders(bad)).toEqual(["*"]);

    const good = "@layer base { * { margin: 0; padding: 0; } }";
    expect(unlayeredRules(good)).toEqual([]);
  });

  it("層の外の @media / @supports / @container の中の悪い例も見つける", () => {
    expect(spacingOffenders("@media (max-width: 767px) { body { margin: 0; } }")).toEqual(["body"]);
    expect(spacingOffenders("@supports (display: grid) { * { padding: 0 } }")).toEqual(["*"]);
    expect(spacingOffenders("@container (min-width: 1px) { p { margin: 0 } }")).toEqual(["p"]);
    // 入れ子の @media でも降りる
    expect(
      spacingOffenders("@media screen { @media (min-width: 768px) { h1 { padding: 0 } } }"),
    ).toEqual(["h1"]);
  });

  it("@media の中でも @layer base に入っていれば許す", () => {
    const layeredInMedia = "@media (max-width: 767px) { @layer base { body { margin: 0; } } }";
    expect(spacingOffenders(layeredInMedia)).toEqual([]);
  });

  it("`@layer a, b;` のような文の直後の規則を「層の中」と見誤らない", () => {
    expect(spacingOffenders("@layer theme, base;\n* { margin: 0; }")).toEqual(["*"]);
    expect(spacingOffenders('@import "tailwindcss";\nbody { padding: 0 }')).toEqual(["body"]);
  });

  it("余白の一部だけを決める書き方（margin-top など）も見つけ、要素でない規則は数えない", () => {
    expect(spacingOffenders("body { margin-top: 0 }")).toEqual(["body"]);
    expect(spacingOffenders("p { padding-inline: 0 }")).toEqual(["p"]);
    // @keyframes の from / to は要素の選択子ではない
    expect(spacingOffenders("@keyframes x { from { margin: 0 } to { margin: 4px } }")).toEqual([]);
    // 引用符の中の波かっこで読み違えない
    expect(spacingOffenders('.x::before { content: "}"; } body { margin: 0 }')).toEqual(["body"]);
  });
});

/**
 * 文字の色として使うトークン。A案で足した --ink-2 / --ink-table / --red-word を含む。
 * `--dash`（#a9b0b7）は「—」の飾り専用で、文字には使わないのでここに入れない。
 */
const TEXT_TOKENS = [
  "--ink",
  "--ink-2",
  "--ink-table",
  "--muted",
  "--faint",
  "--red-word",
  "--green",
  "--amber",
  "--clay",
];

/** 文字が載る地の色（画面の地・入力欄やボタンの面・右側の区画・薄い面）。 */
const GROUND_TOKENS = ["--paper", "--card", "--pane", "--surface-2"];

/** WCAG 2.x AA の本文の基準（小さい文字の最低ライン）。 */
const AA_TEXT = 4.5;

describe("文字の色が地の色の上で読める（WCAG AA 4.5:1）", () => {
  const tokens = rootTokens(CSS);

  it("文字に使う色トークンは、どの地の色の上でも 4.5:1 以上", () => {
    const failures: string[] = [];
    for (const text of TEXT_TOKENS) {
      for (const ground of GROUND_TOKENS) {
        const ratio = contrastRatio(resolveColor(tokens, text), resolveColor(tokens, ground));
        if (ratio < AA_TEXT) failures.push(`${text} on ${ground} = ${ratio.toFixed(2)}:1`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("計算そのものが正しい（既知の値と一致する）", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    // #767676 は白地で AA を満たす最も淡い灰色として知られる値（4.54:1）
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    // 飾り専用の --dash の値は、文字に使うと基準を満たさない（検査が落とせることの確認）
    expect(contrastRatio("#a9b0b7", "#f5f6f7")).toBeLessThan(AA_TEXT);
  });
});

/** font-family の並びから先頭の書体名を取り出す（引用符を外す）。 */
function firstFamily(stack: string): string {
  return stack
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

describe("書体の指定と読み込みがずれていない", () => {
  const tokens = rootTokens(CSS);

  it("--sans / --mono の先頭の書体を app/layout.tsx が Google Fonts から読み込んでいる", () => {
    for (const name of ["--sans", "--mono"]) {
      const family = firstFamily(tokens[name] ?? "");
      expect(family, `${name} の先頭の書体`).not.toBe("");
      expect(LAYOUT).toContain(`family=${family.replace(/ /g, "+")}:`);
    }
  });
});
