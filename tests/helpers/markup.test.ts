import { describe, expect, it } from "vitest";
import { attrOf, elementsOf, hasClass, textOf } from "./markup";

/**
 * 画面のテストが使う「HTML を木として読む」小道具そのものの検査。
 *
 * なぜ必要か: この小道具が甘いと、送る前の画面・録音・共有状態の検査が**黙って空振りする**
 * （2026-09-23 に見つかった空振り3件は、どれも文字列の照合が属性と文字を区別しなかったせい）。
 * ここでは、その3件と同じ形の HTML で、区別できていることを確かめる。
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
