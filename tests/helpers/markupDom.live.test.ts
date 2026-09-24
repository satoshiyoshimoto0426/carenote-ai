// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attrOf, isShown, markupOf, shownText } from "./markup";

/**
 * 動かした画面（jsdom の live テスト）の要素を、tests/helpers/markup.ts の木で読む橋
 * （markupOf・shownText・isShown）そのものの検査。
 *
 * なぜ必要か（2026-09-24 枝 redesign/a-backend を redesign/a へ取り込んだとき）:
 *   利用者の画面・上の帯の live テストの「出ている」の検査は、この橋を通して textOf・isReachable で読む。
 *   橋が祖先の隠す印を落としたり、読み直した木の**別の要素**を返したりすると、その検査が黙って空振りする。
 *   ここでは、jsdom の textContent なら「出ている」と数えてしまう形で、橋が「出ていない」と答えることを確かめる。
 */

// jsdom は起動に十数秒かかる。他のテストと同時に走ると待ち時間が伸びるので広めに取る
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
});

describe("動かした画面の要素を木で読む", () => {
  it.each([
    ["祖先の class の sr-only", '<div class="sr-only"><p id="t">仮名表示中</p></div>'],
    ["祖先の hidden 属性", '<section hidden><div><p id="t">仮名表示中</p></div></section>'],
    ['祖先の aria-hidden="true"', '<div aria-hidden="true"><p id="t">仮名表示中</p></div>'],
    ["自分の class の hidden", '<p id="t" class="mt-1 hidden">仮名表示中</p>'],
    ["自分の style の display:none", '<p id="t" style="display: none">仮名表示中</p>'],
  ])("隠す印（%s）があれば、textContent には出ていても shownText は空・isShown は false", (_label, html) => {
    container.innerHTML = `<header>${html}<h2>B様</h2></header>`;
    const target = container.querySelector("#t");
    // jsdom の textContent は隠した文字も数える（だから「出ている」の検査にそのまま使えない）
    expect(target?.textContent).toBe("仮名表示中");
    expect(shownText(container, target)).toBe("");
    expect(isShown(container, target)).toBe(false);
    // 隠していない隣は読める
    expect(shownText(container, container.querySelector("header"))).toBe("B様");
  });

  it("隠す印が無ければ、入れ子の文字をつなげて返し、奥の隠した文字だけを落とす", () => {
    container.innerHTML =
      '<p id="t">開く<span class="sr-only">（ケアプラン）</span><b>今日</b></p>';
    const target = container.querySelector("#t");
    expect(shownText(container, target)).toBe("開く今日");
    expect(isShown(container, target)).toBe(true);
  });

  it("同じ名前の要素が並んでいても、指した要素そのものを読む（何番目の子要素かでたどる）", () => {
    container.innerHTML = "<ul><li>1</li><li hidden>2</li><li>3</li></ul>";
    const items = container.querySelectorAll("li");
    expect(shownText(container, items[2])).toBe("3");
    expect(isShown(container, items[1])).toBe(false);
    expect(attrOf(markupOf(container, items[1]), "hidden")).toBe("");
  });

  it("React のように文字の節が分かれて並んでいても、場所はずれない", () => {
    const p = document.createElement("p");
    const span = document.createElement("span");
    span.textContent = "C";
    const b = document.createElement("b");
    b.textContent = "E";
    // 文字の節 A・B が隣り合う（HTML に書き出すと AB の1つにまとまる）
    p.append("A", "B", span, "D", b);
    container.append(p);
    expect(shownText(container, b)).toBe("E");
    expect(shownText(container, p)).toBe("ABCDE");
  });

  it("HTML として読み直すと形が変わる入れ子（<p> の中の <div>）は、別の要素を返さずに投げる", () => {
    const p = document.createElement("p");
    const div = document.createElement("div");
    div.textContent = "中";
    p.append(div);
    container.append(p);
    expect(() => markupOf(container, div)).toThrow(/同じ場所にありません/);
  });

  it("root の外の要素は投げる。見つからなかった要素（null・undefined）は「出ていない」", () => {
    const outside = document.createElement("span");
    document.body.append(outside);
    try {
      expect(() => markupOf(container, outside)).toThrow(/root の中にありません/);
    } finally {
      outside.remove();
    }
    container.innerHTML = "<p>見える</p>";
    // 見つからなかった要素を、黙って root 全体に読み替えない
    expect(shownText(container, null)).toBe("");
    expect(shownText(container, undefined)).toBe("");
    expect(isShown(container, null)).toBe(false);
  });

  it("root 自身を渡すと、root 全体の届く文字を読む", () => {
    container.innerHTML = '<p>見える</p><p class="sr-only">読み上げだけ</p>';
    expect(shownText(container, container)).toBe("見える");
    expect(isShown(container, container)).toBe(true);
  });
});
