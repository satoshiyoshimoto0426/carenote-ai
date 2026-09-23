import { describe, expect, it } from "vitest";
import { attrOf, elementsOf, hasClass, isReachable, textOf } from "./markup";

/**
 * 画面のテストが使う「HTML を木として読む」小道具そのものの検査。
 *
 * なぜ必要か: この小道具が甘いと、送る前の画面・録音・共有状態の検査が**黙って空振りする**
 * （2026-09-23 に見つかった空振り3件は、どれも文字列の照合が属性と文字を区別しなかったせい）。
 * ここでは、その3件と同じ形の HTML で、区別できていることを確かめる。
 * あわせて、隠した要素（hidden 属性・sr-only など）の文字を「届く文字」に数えないこと、
 * 隠す印に似ただけの書き方（overflow-hidden など）で文字を落とさないことも確かめる（同日の検収の指摘）。
 * さらに、文字でなく部品そのもの（切り替え・チェックの印・赤い印）が出ているかを見る isReachable が、
 * 自分や祖先の隠す印で「届かない」になることも確かめる（2026-09-24 検収の指摘）。
 */

describe("HTML を木として読む", () => {
  it("class の文字にある disabled: は、disabled 属性として数えない", () => {
    const [button] = elementsOf(
      '<button type="button" class="px-4 disabled:opacity-50">録音を始める</button>',
    );
    expect(attrOf(button, "disabled")).toBeUndefined();
    const [real] = elementsOf('<button disabled="" class="x">録音を始める</button>');
    expect(attrOf(real, "disabled")).toBe("");
  });

  it("title 属性の中の文字は、画面に出る文字に入らない", () => {
    const html = '<li><mark title="敬称の前">佐藤</mark>さん</li>';
    expect(textOf(elementsOf(html)[0])).toBe("佐藤さん");
    const reason = elementsOf(`${html}<span>（敬称の前）</span>`).find((e) => e.tagName === "span");
    expect(reason && textOf(reason)).toBe("（敬称の前）");
  });

  // 2026-09-23 検収: 理由の span に hidden 属性や sr-only を付けても「文字で読める」検査が緑だった
  it.each([
    ["hidden 属性", '<span hidden="">（敬称の前）</span>'],
    ['aria-hidden="true"', '<span aria-hidden="true">（敬称の前）</span>'],
    ["class の sr-only", '<span class="ml-2 sr-only">（敬称の前）</span>'],
    [
      "class の hidden（広い画面だけ出す形も）",
      '<span class="hidden md:inline">（敬称の前）</span>',
    ],
    ["class の invisible", '<span class="text-xs invisible">（敬称の前）</span>'],
    ["style の display:none", '<span style="display:none">（敬称の前）</span>'],
    [
      "style の visibility:hidden",
      '<span style="color:red; visibility: hidden">（敬称の前）</span>',
    ],
  ])("隠す印（%s）のある要素の中の文字は、届く文字に入らない", (_label, reason) => {
    const els = elementsOf(`<li><mark>佐藤</mark>さん${reason}</li>`);
    expect(textOf(els[0])).toBe("佐藤さん");
    // 隠した要素そのものを渡しても空
    const span = els.find((e) => e.tagName === "span");
    expect(span && textOf(span)).toBe("");
  });

  it("祖先に隠す印があれば、奥の要素を直接渡しても空。入れ子の奥の印も効く", () => {
    const deep = elementsOf('<div hidden=""><p><span>理由</span></p></div>').find(
      (e) => e.tagName === "span",
    );
    expect(deep && textOf(deep)).toBe("");
    const [p] = elementsOf(
      '<p>見える<b>字</b><span class="sr-only">読み上げだけ<b>奥</b></span></p>',
    );
    expect(textOf(p)).toBe("見える字");
  });

  it("隠す印に似た書き方（overflow-hidden・md:hidden・aria-hidden=false など）は隠す扱いにしない", () => {
    const [div] = elementsOf(
      '<div class="overflow-hidden md:hidden sr-only-x" aria-hidden="false" style="display:flex">見える</div>',
    );
    expect(textOf(div)).toBe("見える");
  });

  // 2026-09-24 検収: 共有状態の切り替えを包む div を class="hidden"／aria-hidden="true" にしても、
  // 切り替えを数える検査が緑だった（elementsOf は隠した要素も返す）。部品そのものが出ているかを見る
  it.each([
    ["包む要素の class の hidden", '<div class="mt-2 hidden"><div data-testid="sw"></div></div>'],
    [
      '包む要素の aria-hidden="true"',
      '<div class="mt-2" aria-hidden="true"><div data-testid="sw"></div></div>',
    ],
    [
      "遠い祖先の hidden 属性",
      '<section hidden=""><div><div data-testid="sw"></div></div></section>',
    ],
    ["自分の class の sr-only", '<div><div class="w-full sr-only" data-testid="sw"></div></div>'],
    [
      "自分の style の display:none",
      '<div><div style="display: none" data-testid="sw"></div></div>',
    ],
  ])("隠す印（%s）があれば、部品そのものも届かない扱い", (_label, html) => {
    const found = elementsOf(html).filter((e) => attrOf(e, "data-testid") === "sw");
    // elementsOf は隠した部品も返す（だから数える前に isReachable で絞る）
    expect(found).toHaveLength(1);
    expect(isReachable(found[0])).toBe(false);
  });

  it("隠す印が無ければ部品は届く。印に似た書き方と、入れ子の奥の印では部品そのものを隠さない", () => {
    const els = elementsOf(
      '<div class="overflow-hidden md:hidden" aria-hidden="false">' +
        '<div data-testid="sw"><span class="sr-only">説明</span></div></div>',
    );
    const sw = els.find((e) => attrOf(e, "data-testid") === "sw");
    expect(sw && isReachable(sw)).toBe(true);
    // 入れ子の奥の sr-only は、その要素だけを隠す
    const span = els.find((e) => e.tagName === "span");
    expect(span && isReachable(span)).toBe(false);
  });

  it("入れ子の中の文字もつなげて読み、書き換えた記号は元の文字に戻す", () => {
    const [p] = elementsOf('<p>です（<span class="tnum">3</span>か所）&amp;</p>');
    expect(textOf(p)).toBe("です（3か所）&");
  });

  it("class は空白で区切った1語として見る（似た名前や一部には当たらない）", () => {
    const [a, b] = elementsOf(
      '<div class="presend-nav rounded"></div><div class="presend-navi"></div>',
    );
    expect(hasClass(a, "presend-nav")).toBe(true);
    expect(hasClass(b, "presend-nav")).toBe(false);
  });

  it("入れ子の要素も、出てくる順にすべて返す", () => {
    const tags = elementsOf("<div><p><span>a</span></p><input/><b>c</b></div>").map(
      (e) => e.tagName,
    );
    expect(tags).toEqual(["div", "p", "span", "input", "b"]);
  });
});
