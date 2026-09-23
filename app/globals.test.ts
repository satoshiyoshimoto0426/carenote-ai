import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 全体の CSS が Tailwind の余白指定を打ち消していないかを見張る。
 *
 * なぜ必要か（2026-09-23 に発覚した実害バグ）:
 *   Tailwind v4 の余白指定（p-4 / px-3 / space-y-4 など）は `@layer utilities` に入る。
 *   CSS の決まりで、**層に入っていない規則は、層に入った規則に詳細度と関係なく必ず勝つ**。
 *   globals.css の `* { margin: 0; padding: 0 }` が層の外にあったせいで、画面中の余白が
 *   すべて 0 になっていた。ボタンの文字は枠に貼り付き、カードの中身は縁に密着し、
 *   縦の間隔も消えて「左上にギュッと集まった」画面になっていた。
 *   ビルドもテストも緑のまま、見た目だけが壊れる種類の不具合なので、ここで機械的に止める。
 */

const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** コメントを消し、層（@layer）の外に出ている規則だけを取り出す。 */
function unlayeredRules(css: string): { selector: string; body: string }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: { selector: string; body: string }[] = [];
  let depth = 0;
  let layerDepth = -1;
  let buf = "";
  let selector = "";
  for (const ch of text) {
    if (ch === "{") {
      const head = buf.trim();
      if (depth === 0 && head.startsWith("@layer")) layerDepth = 0;
      if (depth === 0) selector = head;
      depth += 1;
      buf = "";
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        if (layerDepth === -1 && !selector.startsWith("@")) {
          rules.push({ selector, body: buf });
        }
        layerDepth = -1;
      }
      buf = "";
      continue;
    }
    buf += ch;
  }
  return rules;
}

/** クラスや属性ではなく、要素そのもの（または全要素 *）を狙った選択子か。 */
function isElementSelector(selector: string): boolean {
  return selector
    .split(",")
    .map((s) => s.trim())
    .some((s) => /^(\*|[a-z][a-z0-9]*)(\s|$|:|::|>|\+|~|\[)/i.test(s) && !s.startsWith("."));
}

describe("全体の CSS が余白指定を打ち消さない", () => {
  it("層の外に、要素の余白（margin / padding）を決める規則を置いていない", () => {
    const offenders = unlayeredRules(CSS).filter(
      (r) => isElementSelector(r.selector) && /(^|;|\s)(margin|padding)\s*:/.test(r.body),
    );
    expect(offenders.map((r) => r.selector)).toEqual([]);
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
    const found = unlayeredRules(bad).filter(
      (r) => isElementSelector(r.selector) && /(margin|padding)\s*:/.test(r.body),
    );
    expect(found.map((r) => r.selector)).toEqual(["*"]);

    const good = "@layer base { * { margin: 0; padding: 0; } }";
    expect(unlayeredRules(good)).toEqual([]);
  });
});
