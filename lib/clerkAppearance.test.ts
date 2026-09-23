import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout from "@/app/layout";
import { CLERK_CSS_LAYER, clerkAppearance } from "@/lib/clerkAppearance";
import {
  layerOrderStatement,
  normalizeHex,
  resolveColor,
  rootTokens,
  stripCssComments,
} from "@/tests/helpers/cssTokens";

// RootLayout を呼んで返ってくる要素の props だけを見る（描かない）。本物の ClerkProvider は
// サーバー側の仕組みを読み込むので、名前だけの代役に差し替える。
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: function ClerkProviderStub() {
    return null;
  },
}));

/**
 * Clerk の見た目（lib/clerkAppearance.ts）が app/globals.css のトークンとずれていないかを見張る。
 *
 * なぜ必要か:
 *   Clerk は CSS 変数を解釈しない箇所があるので、clerkAppearance.ts はトークンの値を16進数で
 *   写して持つ。写しは片方だけ直すと黙ってずれる ── 実際に v1（2026-09-16）で --sans を
 *   Noto Sans JP にしたとき、Clerk だけ Hiragino のまま取り残された。
 *   A案（2026-09-23）でトークンの値をほぼ全部替えるので、ここで機械的に突き合わせる。
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const TOKENS = rootTokens(CSS);

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

/**
 * スマホで指で押す・入力する Clerk の部品のうち、最初の画面（/sign-in・/sign-up）に出るもの。
 * デザインの決まり「押す場所は 44px 以上」の対象。2026-09-23 に開発サーバーの 375px 幅で計測すると、
 * 入力欄と主ボタンが 31.4px、パスワードを見せるボタンが 40×24px、切り替えリンクが 19.4px しかなかった。
 */
const TOUCH_ELEMENTS = [
  "socialButtonsBlockButton",
  "formFieldInput",
  "formFieldInputShowPasswordButton",
  "formButtonPrimary",
  "footerActionLink",
];

/**
 * 上のうち、幅も 44px を約束する部品。ほかは画面の幅いっぱいに広がるので高さだけ見ればよい。
 * 切り替えリンクは文字の長さで幅が決まる（"Sign in" で 44.9px ぎりぎりだった）ので、幅も縛る。
 */
const NARROW_TOUCH_ELEMENTS = ["formFieldInputShowPasswordButton", "footerActionLink"];

/** 押さない部品（外枠・見出し・ラベル・並びの行）。44px の対象外。 */
const LAYOUT_ELEMENTS = [
  "cardBox",
  "card",
  "headerTitle",
  "headerSubtitle",
  "formFieldLabel",
  "formFieldInputGroup",
  "footerAction",
];

/**
 * 押す部品だが、フォームを送った後（メールを入れて次へ進んだ後）にしか出ないため、まだ計測していないもの。
 * エージェントはフォームを送らない決まりなので、docs/REDESIGN-A-SIGNOFF.md の行で追跡する。
 * 計測して 44px にしたら、ここから TOUCH_ELEMENTS へ移す。
 */
const UNMEASURED_TOUCH_ELEMENTS = ["identityPreviewEditButton", "formResendCodeLink"];

/** 押す場所の最低の高さ・幅（px）。このリポジトリのデザインの決まり（WCAG 2.5.5 の 44×44 CSS px と同じ値）。 */
const MIN_TOUCH_PX = 44;

/**
 * Tailwind のクラスの並びから、**画面幅の条件なしで**効く最低の高さ（axis="h"）か幅（axis="w"）を px で読む。
 * 無ければ null。`min-h-11`（1目盛り 4px ＝ 0.25rem・html の文字の大きさは既定の 16px のまま）と
 * `min-h-[48px]` を読む。`sm:min-h-11` のように条件が付いたものは、スマホ幅で効くとは限らないので数えない。
 * `h-11` のような固定の高さも数えない（文字が増えたときにはみ出すので、44px は min-h / min-w で約束する）。
 */
function minSizePx(classes: string, axis: "h" | "w"): number | null {
  let best: number | null = null;
  for (const cls of classes.split(/\s+/)) {
    const m = /^min-([hw])-(?:(\d+(?:\.\d+)?)|\[(\d+(?:\.\d+)?)px\])$/.exec(cls);
    if (!m || m[1] !== axis) continue;
    const value = m[2] !== undefined ? Number(m[2]) * 4 : Number(m[3]);
    if (best === null || value > best) best = value;
  }
  return best;
}

/** elements のクラスを部品の名前→文字列で返す（文字列でない指定は空文字にする）。 */
function elementClasses(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(clerkAppearance.elements ?? {})) {
    out[name] = typeof value === "string" ? value : "";
  }
  return out;
}

/** names のうち、axis の最低の大きさが 44px に届かない（または指定が無い）部品の名前を返す。 */
function tooSmall(names: string[], axis: "h" | "w"): string[] {
  const classes = elementClasses();
  return names.filter((name) => {
    const size = minSizePx(classes[name] ?? "", axis);
    return size === null || size < MIN_TOUCH_PX;
  });
}

/**
 * Clerk の押す・入力する部品が、スマホでも 44px 以上あることを見張る。
 *
 * なぜ必要か: A1 の検証（2026-09-23）で、ログイン画面の部品が 19〜31px しかないと指摘された。
 * 実際の大きさは Clerk が決め、テストは画面を描かないので、ここでは「44px を約束するクラスが付いているか」を縛る。
 * 付けた後に実画面（375px・1440px）で 44px になったことは docs/REDESIGN-A-SIGNOFF.md の「確かめたこと」に記録した。
 */
describe("Clerk の押す・入力する部品は、スマホでも 44px 以上ある", () => {
  it("TOUCH_ELEMENTS のどれにも、条件なしの min-h が 44px 以上ついている", () => {
    expect(tooSmall(TOUCH_ELEMENTS, "h")).toEqual([]);
  });

  it("幅の小さい部品（パスワードを見せるボタン・切り替えリンク）には min-w も 44px 以上ついている", () => {
    expect(tooSmall(NARROW_TOUCH_ELEMENTS, "w")).toEqual([]);
  });

  it("elements の部品は、どれも「押す／押さない／まだ計測していない」のどれかに分けてある", () => {
    // 新しい部品を elements に足したとき、44px の検査から黙って漏れないようにする
    const known = new Set([...TOUCH_ELEMENTS, ...LAYOUT_ELEMENTS, ...UNMEASURED_TOUCH_ELEMENTS]);
    expect(Object.keys(elementClasses()).filter((name) => !known.has(name))).toEqual([]);
  });

  it("切り替えリンクを高くしたぶん、横の案内文と上下の中央で揃えている", () => {
    // footerAction の items-center が無いと、案内文だけが 44px の枠の上に寄る（2026-09-23 /sign-in で確認）
    expect(elementClasses().footerAction?.split(/\s+/)).toContain("items-center");
  });

  it("検査そのものが壊れていない（足りない大きさ・条件付き・固定の高さを見分けられる）", () => {
    expect(minSizePx("min-h-11 bg-[#0e5c46]", "h")).toBe(44);
    expect(minSizePx("min-h-[48px]", "h")).toBe(48);
    expect(minSizePx("min-h-10", "h")).toBe(40);
    expect(minSizePx("inset-y-0 min-h-11 min-w-11", "w")).toBe(44);
    expect(minSizePx("min-h-11", "w")).toBeNull();
    expect(minSizePx("sm:min-h-11 text-white", "h")).toBeNull();
    expect(minSizePx("h-11", "h")).toBeNull();
  });
});

/**
 * globals.css の層の宣言について、Clerk のクラスが画面に効かなくなる誤りを文章で返す（無ければ空）。
 * 本物の globals.css と、下の自己テストの悪い例の両方を**同じ関数**で見る（検査の空振りを防ぐため）。
 */
function clerkLayerProblems(css: string): string[] {
  const statement = layerOrderStatement(css);
  if (!statement) return ["`@layer a, b, …;` の文がありません"];
  const at = (name: string) => statement.names.indexOf(name);
  const missing = ["base", CLERK_CSS_LAYER, "components", "utilities"].filter((n) => at(n) < 0);
  if (missing.length > 0) return missing.map((n) => `${n} が層の宣言にありません`);

  const problems: string[] = [];
  if (at(CLERK_CSS_LAYER) < at("base")) problems.push(`${CLERK_CSS_LAYER} が base より前`);
  if (at(CLERK_CSS_LAYER) > at("components") || at(CLERK_CSS_LAYER) > at("utilities")) {
    problems.push(`${CLERK_CSS_LAYER} が components / utilities より後`);
  }
  // 層の順番は名前が初めて出てきた順で決まる。先に別の @layer があると、この宣言は順番を決めない
  if (statement.index !== statement.firstLayerIndex) problems.push("最初の層の宣言ではない");
  // Tailwind の読み込みは中で theme, base, components, utilities を宣言する。それより後に書くと
  // clerk は utilities の後ろに付く
  const tailwind = stripCssComments(css).indexOf('@import "tailwindcss"');
  if (tailwind < 0) problems.push("Tailwind の読み込みがありません");
  else if (statement.index > tailwind) problems.push("Tailwind の読み込みより後");
  return problems;
}

/**
 * Clerk のスタイルが層（@layer）に入り、elements の Tailwind クラスが画面に効く並びになっているかを見張る。
 *
 * なぜ必要か（2026-09-23 に /sign-in の実画面で計測）:
 *   層の外にあるスタイルは、層に入った Tailwind のクラスに詳細度と関係なく勝つ。Clerk のスタイルが
 *   層の外にあったため、elements に書いたクラス（枠線・影なし・組織切替の w-full など）は生成されているのに
 *   画面に効いていなかった。テストは値を見るだけなので緑のまま ── 同じ日に globals.css の `*` リセットで
 *   起きたのと同じ仕組みの見落とし（2回目）。3か所（layout.tsx・globals.css・この名前）が1組なので、
 *   どれか1つが外れたらここで落とす。
 */
describe("Clerk のスタイルが Tailwind のクラスに負けない層に入っている", () => {
  it("globals.css の先頭で、Clerk の層を base の後・components / utilities の前に並べている", () => {
    expect(clerkLayerProblems(CSS)).toEqual([]);
  });

  it("app/layout.tsx の ClerkProvider に同じ層の名前（cssLayerName）を渡している", () => {
    const el = RootLayout({ children: null }) as ReactElement<{
      appearance?: { cssLayerName?: string };
    }>;
    expect(el.props.appearance?.cssLayerName).toBe(CLERK_CSS_LAYER);
  });

  it("検査そのものが壊れていない（並びの誤りと置き場所の誤りを見つけられる）", () => {
    const tw = '\n@import "tailwindcss";';
    expect(clerkLayerProblems(`@layer theme, base, clerk, components, utilities;${tw}`)).toEqual(
      [],
    );
    expect(clerkLayerProblems(`@layer theme, base, components, utilities, clerk;${tw}`)).toEqual([
      "clerk が components / utilities より後",
    ]);
    expect(clerkLayerProblems(`@layer theme, clerk, base, components, utilities;${tw}`)).toEqual([
      "clerk が base より前",
    ]);
    expect(
      clerkLayerProblems(
        '@import "tailwindcss";\n@layer theme, base, clerk, components, utilities;',
      ),
    ).toEqual(["Tailwind の読み込みより後"]);
    expect(
      clerkLayerProblems(
        `@layer base { * { margin: 0 } }\n@layer theme, base, clerk, components, utilities;${tw}`,
      ),
    ).toEqual(["最初の層の宣言ではない"]);
    expect(clerkLayerProblems(`@layer theme, base, components, utilities;${tw}`)).toEqual([
      "clerk が層の宣言にありません",
    ]);
    // コメントの中の `@layer a, b;` は宣言として数えない
    expect(
      clerkLayerProblems(`/* @layer theme, base, clerk, components, utilities; */${tw}`),
    ).toEqual(["`@layer a, b, …;` の文がありません"]);
  });
});
