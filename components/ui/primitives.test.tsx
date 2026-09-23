import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type CssNode, parseCss } from "@/tests/helpers/cssTokens";
import { btnPrimary, btnSecondary, Pane, PaneHeader, SectionLabel, TextAction } from "./primitives";

/**
 * A案「作業台」の区画の部品（components/ui/primitives.tsx）と、それを形にする CSS（app/globals.css）を固定する。
 *
 * なぜ必要か:
 *   - 区画（Pane）はこれから作り替える全画面（利用者・つくる・点検）の土台。部品が付けるクラスと、
 *     CSS 側の名前がずれると、画面が組めないのにテストは緑のままになる（見た目はテストが見ないため）。
 *   - 区画は 768px 以上で自分の中だけで縦に動く。区画の中で貼りつく物（赤い言葉の「前へ／次へ」）と
 *     フォーカスの止まる位置は、区画の上端に重なる物（頭の帯）の高さだけ下げる。ここを外すと、
 *     「前へ／次へ」や操作した部品が頭の帯の裏に隠れる（2026-09-17 critical・2026-09-23 A3 と同じ種類）。
 *   - 幅を決めた区画（.pane-640 / .pane-440）と、区画どうしの境目の 1px の線（.pane + .pane）は
 *     A案の区画の決まり（計画 F6）そのもの。規則が消えても部品の出す文字列は変わらないので、CSS 側も見る。
 *   - ボタンはスマホで指で押せる大きさ（44px）を約束する（デザインの決まり）。
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** 規則1つと、それを包んでいる @ 規則の前置き（外側から順）。 */
interface Rule {
  selector: string;
  declarations: string;
  context: string[];
}

/** globals.css の規則を、@layer / @media の中まで降りて全部集める。 */
function allRules(): Rule[] {
  const out: Rule[] = [];
  const visit = (nodes: CssNode[], context: string[]) => {
    for (const node of nodes) {
      if (node.prelude.startsWith("@")) {
        visit(node.children, [...context, node.prelude]);
        continue;
      }
      // 選択子の中の改行・空白の違いで一致しなくならないよう、空白を1つにそろえる
      const selector = node.prelude.trim().replace(/\s+/g, " ");
      out.push({ selector, declarations: node.declarations, context });
    }
  };
  visit(parseCss(CSS), []);
  return out;
}

/** 選択子がちょうど selector の規則のうち、context の条件（前置きの正規表現）をすべて満たすもの。 */
function rulesOf(selector: string, ...within: RegExp[]): Rule[] {
  return allRules().filter(
    (r) => r.selector === selector && within.every((re) => r.context.some((c) => re.test(c))),
  );
}

/** 規則の並びから property の値を全部取り出す。 */
function valuesOf(rules: Rule[], property: string): string[] {
  return rules.flatMap((r) =>
    [...r.declarations.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "g"))].map(
      (m) => m[1].trim(),
    ),
  );
}

const WIDE = /^@media\s*\(min-width:\s*768px\)/;
const PHONE = /^@media\s*\(max-width:\s*767px\)/;
const COMPONENTS = /^@layer\s+components$/;

describe("区画の部品（Pane / PaneHeader / SectionLabel / TextAction）", () => {
  const html = (node: ReactElement) => renderToStaticMarkup(node);

  it("Pane は既定で section.pane。幅・地・要素の種類・読み上げの名前を切り替えられる", () => {
    expect(html(<Pane>中身</Pane>)).toBe('<section class="pane">中身</section>');
    expect(
      html(
        <Pane width={640} tinted label="入力">
          中身
        </Pane>,
      ),
    ).toBe('<section aria-label="入力" class="pane pane-640 pane-tinted">中身</section>');
    expect(
      html(
        <Pane width={440} as="aside" label="B様" className="px-7">
          中身
        </Pane>,
      ),
    ).toBe('<aside aria-label="B様" class="pane pane-440 px-7">中身</aside>');
  });

  it("PaneHeader は頭の帯。title を渡すと区画の名前を h2 で出し、渡さなければ中身だけ", () => {
    expect(html(<PaneHeader title="AIに送る文章">操作</PaneHeader>)).toBe(
      '<div class="pane-header"><h2 class="pane-title">AIに送る文章</h2>操作</div>',
    );
    expect(html(<PaneHeader>書類の種類</PaneHeader>)).toBe(
      '<div class="pane-header">書類の種類</div>',
    );
  });

  it("SectionLabel は htmlFor で入力欄に結んだ label、無ければ h3（as で変えられる）", () => {
    expect(html(<SectionLabel htmlFor="memo">会議のメモ</SectionLabel>)).toBe(
      '<label for="memo" class="section-label">会議のメモ</label>',
    );
    expect(html(<SectionLabel>書類</SectionLabel>)).toBe('<h3 class="section-label">書類</h3>');
    expect(html(<SectionLabel as="p">書類</SectionLabel>)).toBe(
      '<p class="section-label">書類</p>',
    );
  });

  it("TextAction は href ならリンク、onClick なら type=button のボタン（見た目だけの div にしない）", () => {
    expect(html(<TextAction href="/rescue">一式まとめて</TextAction>)).toBe(
      '<a class="text-action" href="/rescue">一式まとめて</a>',
    );
    expect(html(<TextAction onClick={() => {}}>記録として残す</TextAction>)).toBe(
      '<button type="button" class="text-action">記録として残す</button>',
    );
    expect(
      html(
        <TextAction onClick={() => {}} disabled>
          記録として残す
        </TextAction>,
      ),
    ).toBe('<button type="button" disabled="" class="text-action">記録として残す</button>');
  });
});

describe("ボタンの寸法（A案のアートボード）", () => {
  const classes = (s: string) => s.split(/\s+/);

  it("主ボタンは条件なしで高さ 44px を約束する（スマホで押せる・アートボードの送信ボタンと同じ）", () => {
    expect(classes(btnPrimary)).toEqual(expect.arrayContaining(["min-h-11", "bg-[var(--green)]"]));
  });

  it("脇のボタンはスマホで 44px、768px 以上で 34px。枠は --btn-line、文字は本文と同じ --ink", () => {
    expect(classes(btnSecondary)).toEqual(
      expect.arrayContaining([
        "min-h-11",
        "md:min-h-[34px]",
        "border-[var(--btn-line)]",
        "text-[var(--ink)]",
        "rounded-[8px]",
      ]),
    );
  });
});

describe("区画の CSS（app/globals.css）", () => {
  it.each([
    ".panes",
    ".pane",
    ".pane-640",
    ".pane-440",
    ".pane + .pane",
    ".pane-tinted",
    ".pane-header",
    ".pane-title",
    ".section-label",
    ".text-action",
    ".legacy-page",
  ])("%s は @layer components の中にある（className で足した Tailwind の指定に負けて消えないように）", (selector) => {
    const rules = rulesOf(selector);
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) expect(rule.context.some((c) => COMPONENTS.test(c))).toBe(true);
  });

  it("768px 以上では区画と旧画面の器が自分の中で縦に動く", () => {
    for (const selector of [".pane", ".legacy-page"]) {
      expect(valuesOf(rulesOf(selector, WIDE), "overflow-y")).toEqual(["auto"]);
      expect(valuesOf(rulesOf(selector, WIDE), "min-height")).toEqual(["0"]);
    }
    expect(valuesOf(rulesOf(".panes", WIDE), "flex-direction")).toEqual(["row"]);
  });

  it("768px 以上で幅を決めた区画は、その幅を上限に縮む（伸びない・はみ出さない）。スマホでは幅を決めない", () => {
    // Pane の width={640|440} が付けるクラス。規則が消えると区画が残りの幅いっぱいに広がる
    expect(valuesOf(rulesOf(".pane-640", WIDE), "flex")).toEqual(["0 1 640px"]);
    expect(valuesOf(rulesOf(".pane-440", WIDE), "flex")).toEqual(["0 1 440px"]);
    // スマホでは区画を縦に積むので、幅の規則は 768px 以上の中だけに置く
    for (const selector of [".pane-640", ".pane-440"]) {
      for (const rule of rulesOf(selector))
        expect(rule.context.some((c) => WIDE.test(c))).toBe(true);
    }
  });

  it("区画どうしの境目は 1px の線だけ。スマホ（縦に積む）は上、768px 以上（横に並ぶ）は左に引く", () => {
    const phone = rulesOf(".pane + .pane").filter((r) => !r.context.some((c) => WIDE.test(c)));
    expect(valuesOf(phone, "border-top")).toEqual(["1px solid var(--line)"]);
    expect(valuesOf(phone, "border-left")).toEqual([]);
    // 横に並べたら上の線は消し、左に引く（上下に線が残ると枠を積んだように見える）
    expect(valuesOf(rulesOf(".pane + .pane", WIDE), "border-top")).toEqual(["0"]);
    expect(valuesOf(rulesOf(".pane + .pane", WIDE), "border-left")).toEqual([
      "1px solid var(--line)",
    ]);
  });

  it("区画の中で貼りつく物とフォーカスの止まる位置は、区画の上端に重なる物の高さ（--sticky-top）から決める", () => {
    for (const selector of [".pane", ".legacy-page"]) {
      expect(valuesOf(rulesOf(selector, WIDE), "--sticky-top")).toEqual(["0px"]);
      expect(valuesOf(rulesOf(selector, WIDE), "scroll-padding-top")).toEqual([
        "calc(var(--sticky-top) + 8px)",
      ]);
    }
    // 頭の帯を直下に持つ区画は、帯の高さぶん下げる（帯の裏に隠さない）
    expect(valuesOf(rulesOf(".pane:has(> .pane-header)", WIDE), "--sticky-top")).toEqual([
      "var(--pane-header-h)",
    ]);
    expect(valuesOf(rulesOf(".pane-header", WIDE), "position")).toEqual(["sticky"]);
    expect(valuesOf(rulesOf(".pane-header", WIDE), "top")).toEqual(["0"]);
  });

  it("「前へ／次へ」の帯は、区画の中なら --sticky-top、文書が動く所（スマホ）なら帯の測った高さを使う", () => {
    const top = valuesOf(rulesOf(".presend-nav"), "top");
    expect(top).toEqual(["calc(var(--sticky-top, var(--shell-head-h, var(--topbar-h))) + 8px)"]);
  });

  it("スマホでは区画の頭の帯を貼りつけない（上の帯の裏に潜るため）。文字だけの操作は 44px", () => {
    // position を決めている .pane-header の規則は、どれも 768px 以上の中にある
    const positioned = rulesOf(".pane-header").filter((r) => valuesOf([r], "position").length > 0);
    expect(positioned.length).toBeGreaterThan(0);
    for (const rule of positioned) expect(rule.context.some((c) => WIDE.test(c))).toBe(true);
    expect(valuesOf(rulesOf(".text-action", PHONE), "min-height")).toEqual(["44px"]);
  });

  it("旧画面の器は、作り替える前の本文と同じ幅（中身 920px まで・左右 40px 以上）と余白を持つ", () => {
    expect(valuesOf(rulesOf(".legacy-page", WIDE), "padding-inline")).toEqual([
      "max(40px, calc((100% - 920px) / 2))",
    ]);
    // 上下の 40px は動く器の padding にしない（中で貼りつく「前へ／次へ」の基準が 40px 下がるため）。
    // 代わりに ::before / ::after の空の箱（flex の高さ 40px）で空ける
    expect(valuesOf(rulesOf(".legacy-page", WIDE), "padding-block")).toEqual(["0"]);
    expect(valuesOf(rulesOf(".legacy-page::before, .legacy-page::after", WIDE), "flex")).toEqual([
      "0 0 40px",
    ]);
    // スマホは旧 .app-main-inner と同じ（上 16・左右 16・下 32）
    const phone = rulesOf(".legacy-page").filter((r) => !r.context.some((c) => WIDE.test(c)));
    expect(valuesOf(phone, "padding")).toEqual(["16px 16px 32px"]);
  });

  it("768px 以上の外枠は画面の高さちょうど（引き算をせず 100dvh。本文へは flex で残りを渡す）", () => {
    expect(valuesOf(rulesOf(".app-shell", WIDE), "height")).toEqual(["100dvh"]);
    expect(valuesOf(rulesOf(".app-main-inner"), "min-height")).toEqual(["0"]);
    // 本文は画面いっぱい（幅の上限・余白は .legacy-page へ移した）
    expect(valuesOf(rulesOf(".app-main-inner"), "max-width")).toEqual([]);
    expect(valuesOf(rulesOf(".app-main-inner"), "padding")).toEqual([]);
  });
});
