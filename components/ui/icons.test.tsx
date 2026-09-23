import { type ComponentType, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IconProps } from "./icons";
import * as icons from "./icons";

/**
 * 線アイコン集の約束を、**書き出したアイコン全部**について確かめる。
 *
 * なぜ必要か:
 *   A案のアートボードの SVG には aria-hidden が付いていない。そのまま貼ると
 *   Biome の noSvgWithoutTitle（error）に当たり、読み上げでは意味のない図形が読まれる。
 *   共通の外枠（Svg）を通さずに書いたアイコンが1つでも混ざれば、ここで落ちる。
 *   一覧を手で書かずに書き出し（export）から数えるので、新しいアイコンも自動で対象になる。
 */

/** icons.tsx が書き出すアイコン部品（名前が Icon で始まる関数）。型の書き出しは実行時には消える。 */
const ICONS = Object.entries(icons).filter(
  ([name, value]) => name.startsWith("Icon") && typeof value === "function",
);

function draw(Icon: ComponentType<IconProps>, props: IconProps = {}): string {
  return renderToStaticMarkup(createElement(Icon, props));
}

describe("components/ui/icons", () => {
  it("書き出しはアイコン部品だけで、数え漏れがない", () => {
    // 部品以外（定数など）が混ざったら、この数え方が変わるので気づけるようにする
    expect(ICONS.length).toBe(Object.keys(icons).length);
    expect(ICONS.length).toBeGreaterThan(0);
  });

  it("A案で使う新しいアイコンが揃っている（ナビ4項目・録音・赤い言葉の前後）", () => {
    const names = ICONS.map(([name]) => name);
    for (const required of [
      "IconPeople",
      "IconPencil",
      "IconCheckCircle",
      "IconHelpCircle",
      "IconMic",
      "IconChevronUp",
      "IconChevronDown",
    ]) {
      expect(names).toContain(required);
    }
  });

  it.each(ICONS)("%s は読み上げから隠し、文字色を受け継ぐ線だけの 24×24 で描く", (_name, Icon) => {
    const html = draw(Icon);
    expect(html.startsWith("<svg")).toBe(true);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('stroke="currentColor"');
    // 中身のない空の枠になっていない
    expect(html).toMatch(/<(path|circle|rect)\b/);
  });

  it.each(
    ICONS,
  )("%s は線の太さの既定が 1.6 で、strokeWidth を渡すとその太さになる", (_name, Icon) => {
    expect(draw(Icon)).toContain('stroke-width="1.6"');
    const thick = draw(Icon, { strokeWidth: 1.8 });
    expect(thick).toContain('stroke-width="1.8"');
    expect(thick).not.toContain('stroke-width="1.6"');
    // 太さを変えても読み上げから隠す約束は外れない
    expect(thick).toContain('aria-hidden="true"');
  });

  it("大きさとクラスを受け取る（既定の大きさは 17）", () => {
    expect(draw(icons.IconPencil)).toContain('width="17" height="17"');
    const html = draw(icons.IconPencil, { size: 20, className: "text-[var(--green)]" });
    expect(html).toContain('width="20" height="20"');
    expect(html).toContain('class="text-[var(--green)]"');
  });
});
