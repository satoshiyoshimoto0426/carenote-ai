import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import { contrastRatio, parseCss, resolveColor, rootTokens } from "@/tests/helpers/cssTokens";

// ③ の検査は RootLayout を実際に描いて、出てきた <link> を見る。本物の ClerkProvider は
// サーバー側の仕組みを読み込むので、子をそのまま描くだけの代役に差し替える
// （lib/clerkAppearance.test.ts は props を見るだけなので null を返す代役。ここは <head> の中まで描く必要がある）。
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: function ClerkProviderStub({ children }: { children?: ReactNode }) {
    return children;
  },
}));

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
 *   同日の追補（A1 の検証）: 以前は layout.tsx の**文字列**に `family=IBM+Plex+Sans+JP:` があるかだけを
 *   見ていたので、`<link rel="stylesheet">` の行を消しても緑のままだった（URL の定数が残るため）。
 *   今は RootLayout を描き、出てきた HTML に「その書体と太さを載せた rel="stylesheet" の <link>」が
 *   あることを確かめる。
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

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

  /**
   * A案の外枠（components/shell/・components/SharingStatus.tsx）は、上の4つ以外の地に文字を載せる。
   * [文字, 地, どこか]。外枠の CSS（globals.css の .rail* / .sharing-strip）で組み合わせを変えたら、ここも直す。
   */
  const SHELL_PAIRS: [string, string, string][] = [
    ["--muted", "--rail", "左の帯の項目の名前（開いていない項目）・ログイン中の人の短い名前"],
    ["--ink", "--rail", "左の帯の CN・項目にマウスを載せたとき"],
    ["--ink", "--active", "左の帯の開いている項目の名前"],
    ["--ink-2", "--active", "「この画面の使い方」にマウスを載せたとき"],
    ["--ink-2", "--amber-soft", "共有していないときの注意の帯の文"],
    ["--ink", "--amber-soft", "注意の帯の太字「置き換わりません」"],
  ];

  it("A案の外枠で使う文字と地の組み合わせも 4.5:1 以上", () => {
    const failures = SHELL_PAIRS.filter(
      ([text, ground]) =>
        contrastRatio(resolveColor(tokens, text), resolveColor(tokens, ground)) < AA_TEXT,
    ).map(([text, ground, where]) => `${text} on ${ground}（${where}）`);
    expect(failures).toEqual([]);
  });

  /**
   * 利用者の一覧で選んでいる行（globals.css の `.client-table tbody tr[data-selected]` ── 地 --row-selected）に載る文字。
   * [文字, 地, どこか]。一覧の表（components/clients/ClientTable.tsx）の文字の色を変えたら、ここも直す（2026-09-24 A5）。
   */
  const SELECTED_ROW_PAIRS: [string, string, string][] = [
    ["--ink", "--row-selected", "選んだ行の記号（B様）"],
    ["--green", "--row-selected", "選んだ行の記号にマウスを載せたとき"],
    ["--ink-table", "--row-selected", "選んだ行の属性"],
    ["--muted", "--row-selected", "選んだ行の登録日・（属性未設定）"],
  ];

  it("利用者の一覧で選んでいる行の文字も 4.5:1 以上", () => {
    const failures = SELECTED_ROW_PAIRS.filter(
      ([text, ground]) =>
        contrastRatio(resolveColor(tokens, text), resolveColor(tokens, ground)) < AA_TEXT,
    ).map(([text, ground, where]) => `${text} on ${ground}（${where}）`);
    expect(failures).toEqual([]);
  });

  /**
   * 利用者の区画（components/clients/ClientPane.tsx・DocumentPanel.tsx）の札に載る文字（2026-09-24 A6）。
   * 札の地は上の4つの地に入っていないので、ここで組み合わせを縛る。札の色を変えたら、ここも直す。
   */
  const CLIENT_PANE_PAIRS: [string, string, string][] = [
    ["--amber", "--amber-soft", "書類の「下書き」の札"],
    ["--green", "--green-soft", "書類の「承認済み」の札・頭の「仮名表示中」の札"],
  ];

  it("利用者の区画の札の文字も 4.5:1 以上", () => {
    const failures = CLIENT_PANE_PAIRS.filter(
      ([text, ground]) =>
        contrastRatio(resolveColor(tokens, text), resolveColor(tokens, ground)) < AA_TEXT,
    ).map(([text, ground, where]) => `${text} on ${ground}（${where}）`);
    expect(failures).toEqual([]);
  });

  /**
   * つくる（app/(dashboard)/create/page.tsx と components/drafts/・R1 2026-09-24）の帯に載る文字。
   * 帯の地（--clay-soft / --amber-soft）は上の4つの地に入っていないので、ここで組み合わせを縛る。帯の色を変えたら、ここも直す。
   */
  const CREATE_PAIRS: [string, string, string][] = [
    ["--clay", "--clay-soft", "エラーの帯（.create-error）"],
    ["--ink", "--amber-soft", "下書きの注意の帯（.create-band-caution）"],
    ["--amber", "--amber-soft", "要確認事項・全文を開いていない欄の知らせ・追記案の見出し"],
    ["--ink-2", "--amber-soft", "全文を開いていない欄の知らせの説明・追記案の理由と札"],
  ];

  it("つくるの帯の文字も 4.5:1 以上", () => {
    const failures = CREATE_PAIRS.filter(
      ([text, ground]) =>
        contrastRatio(resolveColor(tokens, text), resolveColor(tokens, ground)) < AA_TEXT,
    ).map(([text, ground, where]) => `${text} on ${ground}（${where}）`);
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

/**
 * 書体ごとに読み込まなければならない太さ。A案の画面の決まり（本文 400・強調 500・見出し 700、
 * 記号・件数・日付の Mono は 400 / 500 ── 実装計画 F1）。読み込んでいない太さは、近い太さで代わりに
 * 描かれるか、ブラウザが太く見せかけて描くので、画面がデザインとずれる。
 */
const REQUIRED_WEIGHTS: Record<string, number[]> = {
  "--sans": [400, 500, 700],
  "--mono": [400, 500],
};

/** React が属性の値に入れる文字の置き換え（&amp; など）を元に戻す。&amp; は最後に戻す。 */
function decodeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** 描いた HTML から、すべての <link> の属性を取り出す（属性の名前は小文字にそろえる）。 */
function linkTags(html: string): Record<string, string>[] {
  return [...html.matchAll(/<link\b([^>]*)>/gi)].map((tag) => {
    const attrs: Record<string, string> = {};
    for (const [, name, quoted] of tag[1].matchAll(
      /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:="([^"]*)")?/g,
    )) {
      attrs[name.toLowerCase()] = decodeAttr(quoted ?? "");
    }
    return attrs;
  });
}

/** Google Fonts の CSS の読み込み先（css2）。これ以外の <link> は書体の読み込みとして数えない。 */
const GOOGLE_CSS2 = "https://fonts.googleapis.com/css2?";

/**
 * Google Fonts（css2）の href から、書体名ごとに読み込む太さの範囲を取り出す。
 * family の書き方: `IBM Plex Sans JP:wght@400;500;700`、`X:ital,wght@0,400;1,700`、
 * 可変の太さは `X:wght@100..900`。軸の指定が無い `family=X` は 400 だけ。
 */
function googleFontWeights(href: string): Map<string, [number, number][]> {
  const out = new Map<string, [number, number][]>();
  if (!href.startsWith(GOOGLE_CSS2)) return out;
  for (const family of new URL(href).searchParams.getAll("family")) {
    const [name, spec] = family.split(":");
    const ranges: [number, number][] = [];
    if (spec === undefined) {
      ranges.push([400, 400]);
    } else {
      const [axes, tuples = ""] = spec.split("@");
      const wght = axes.split(",").indexOf("wght");
      for (const tuple of tuples.split(";")) {
        const value = wght < 0 ? "400" : (tuple.split(",")[wght] ?? "");
        const [lo, hi = lo] = value.split("..").map(Number);
        if (Number.isFinite(lo) && Number.isFinite(hi)) ranges.push([lo, hi]);
      }
    }
    out.set(name, [...(out.get(name) ?? []), ...ranges]);
  }
  return out;
}

/**
 * 描いた HTML が、求める書体と太さを Google Fonts から読み込んでいるかを確かめ、足りないものを返す。
 * 数えるのは、`rel` に `stylesheet` を含み、無効（disabled）でなく、`media` が付いていないか
 * all / screen の <link> だけ（`media="print"` などは画面の表示には効かない）。
 */
function fontLinkProblems(
  html: string,
  required: { family: string; weights: number[] }[],
): string[] {
  const loaded = new Map<string, [number, number][]>();
  for (const link of linkTags(html)) {
    const rels = (link.rel ?? "").toLowerCase().split(/\s+/);
    const media = (link.media ?? "all").trim().toLowerCase();
    if (!rels.includes("stylesheet") || "disabled" in link || !/^(all|screen)$/.test(media))
      continue;
    for (const [family, ranges] of googleFontWeights(link.href ?? "")) {
      loaded.set(family, [...(loaded.get(family) ?? []), ...ranges]);
    }
  }
  const problems: string[] = [];
  for (const { family, weights } of required) {
    const ranges = loaded.get(family);
    if (!ranges) {
      problems.push(`${family} を読み込む <link rel="stylesheet"> がありません`);
      continue;
    }
    const missing = weights.filter((w) => !ranges.some(([lo, hi]) => lo <= w && w <= hi));
    if (missing.length > 0)
      problems.push(`${family} の太さ ${missing.join(" / ")} を読み込んでいません`);
  }
  return problems;
}

describe("書体の指定と読み込みがずれていない", () => {
  const tokens = rootTokens(CSS);
  const required = Object.entries(REQUIRED_WEIGHTS).map(([name, weights]) => ({
    family: firstFamily(tokens[name] ?? ""),
    weights,
  }));

  it("--sans / --mono の先頭の書体を app/layout.tsx が Google Fonts から読み込んでいる（描いた HTML で確かめる）", () => {
    for (const { family } of required) expect(family, "--sans / --mono の先頭の書体").not.toBe("");
    const html = renderToStaticMarkup(RootLayout({ children: null }));
    expect(fontLinkProblems(html, required)).toEqual([]);
  });

  it("検査そのものが壊れていない（<link> が無い・rel が違う・太さが足りない、を見つけられる）", () => {
    const need = [
      { family: "IBM Plex Sans JP", weights: [400, 500, 700] },
      { family: "IBM Plex Mono", weights: [400, 500] },
    ];
    const href =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;700&amp;family=IBM+Plex+Mono:wght@400;500&amp;display=swap";
    expect(fontLinkProblems(`<head><link href="${href}" rel="stylesheet"/></head>`, need)).toEqual(
      [],
    );
    // <link> の行を消した（URL の定数だけが残った）── 以前の文字列の検査はこれを見逃した
    expect(
      fontLinkProblems(
        '<head><link rel="preconnect" href="https://fonts.googleapis.com"/></head>',
        need,
      ),
    ).toEqual([
      'IBM Plex Sans JP を読み込む <link rel="stylesheet"> がありません',
      'IBM Plex Mono を読み込む <link rel="stylesheet"> がありません',
    ]);
    // rel が stylesheet でない・画面に効かない media・無効
    expect(fontLinkProblems(`<link href="${href}" rel="preload"/>`, need)).toHaveLength(2);
    expect(
      fontLinkProblems(`<link href="${href}" rel="stylesheet" media="print"/>`, need),
    ).toHaveLength(2);
    expect(
      fontLinkProblems(`<link href="${href}" rel="stylesheet" disabled=""/>`, need),
    ).toHaveLength(2);
    // 太さが足りない
    const thin =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500&amp;family=IBM+Plex+Mono:wght@400";
    expect(fontLinkProblems(`<link href="${thin}" rel="stylesheet"/>`, need)).toEqual([
      "IBM Plex Sans JP の太さ 700 を読み込んでいません",
      "IBM Plex Mono の太さ 500 を読み込んでいません",
    ]);
    // 可変の太さの範囲・ital 付きの書き方・軸の指定なし（400 だけ）も読める
    const variable = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@100..900";
    const ital =
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400";
    expect(
      fontLinkProblems(
        `<link rel="stylesheet" href="${variable}"><link rel="stylesheet" href="${ital}">`,
        need,
      ),
    ).toEqual([]);
    expect(
      fontLinkProblems(
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono">',
        need,
      ),
    ).toEqual([
      'IBM Plex Sans JP を読み込む <link rel="stylesheet"> がありません',
      "IBM Plex Mono の太さ 500 を読み込んでいません",
    ]);
  });
});
