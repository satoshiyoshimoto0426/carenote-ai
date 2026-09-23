import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MANUAL_CHAPTERS } from "@/lib/manual/content";
import { BUNDLE_MODE, helpAnchorOf, NAV_ITEMS, sectionOf } from "./nav";

/** carenote-ai の根（このファイルは lib/ の直下）。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * ナビ4項目の決まりを固定する。
 *
 * なぜ必要か: 古い URL（/rescue・/dashboard）はブックマーク・マニュアル・撮影の道具が使っていて
 * 当分残る。ナビを6項目から4項目にしたとき、古い URL を開いた人に「どこにいるか」が
 * 光らない・使い方の章がずれる、という壊れ方は画面を見ないと気づけないので、ここで先に縛る。
 */

describe("NAV_ITEMS", () => {
  it("利用者・つくる・点検・使い方の4項目を、この順と行き先で持つ", () => {
    expect(NAV_ITEMS.map(({ section, label, href }) => [section, label, href])).toEqual([
      ["clients", "利用者", "/clients"],
      ["create", "つくる", "/create"],
      ["check", "点検", "/evaluate"],
      ["guide", "使い方", "/guide"],
    ]);
  });

  it("どの項目も、自分の行き先を開くと自分が光る", () => {
    for (const item of NAV_ITEMS) {
      expect(sectionOf(item.href)).toBe(item.section);
    }
  });
});

describe("sectionOf", () => {
  it.each([
    ["/clients", "clients"],
    ["/clients/", "clients"],
    ["/clients/abc-123", "clients"],
    ["/create", "create"],
    ["/create?client=abc&type=meetingSummary", "create"],
    // 旧・救済モードは「つくる」の「一式まとめて」
    ["/rescue", "create"],
    ["/evaluate", "check"],
    ["/evaluate?tab=history", "check"],
    // 旧・ダッシュボード（評価の履歴）は「点検」
    ["/dashboard", "check"],
    ["/guide", "guide"],
    ["/guide#ch3", "guide"],
  ] as const)("%s → %s", (path, section) => {
    expect(sectionOf(path)).toBe(section);
  });

  it.each([
    "/",
    "/sign-in",
    "/sign-up/verify",
    // 先頭が似ているだけの別の URL は当てない
    "/clientsx",
    "/creator",
    "/guidebook",
    "/api/clients",
  ])("%s はどの項目でもない（null）", (path) => {
    expect(sectionOf(path)).toBeNull();
  });
});

describe("helpAnchorOf", () => {
  it.each([
    ["/clients", undefined, "ch2"],
    ["/clients/abc-123", undefined, "ch2"],
    ["/create", undefined, "ch3"],
    ["/create", null, "ch3"],
    ["/create", "other", "ch3"],
    ["/create", BUNDLE_MODE, "ch6"],
    ["/rescue", undefined, "ch6"],
    ["/rescue", null, "ch6"],
    ["/evaluate", undefined, "ch1"],
    ["/dashboard", undefined, "ch1"],
  ] as const)("%s（mode=%s）→ %s", (path, mode, anchor) => {
    expect(helpAnchorOf(path, mode)).toBe(anchor);
  });

  it("使い方の中と、ナビの外の画面では飛び先を出さない", () => {
    expect(helpAnchorOf("/guide")).toBeNull();
    expect(helpAnchorOf("/guide", BUNDLE_MODE)).toBeNull();
    expect(helpAnchorOf("/")).toBeNull();
    expect(helpAnchorOf("/sign-in")).toBeNull();
  });

  it("「一式まとめて」の mode は つくる の中でだけ効く", () => {
    expect(helpAnchorOf("/clients", BUNDLE_MODE)).toBe("ch2");
    expect(helpAnchorOf("/evaluate", BUNDLE_MODE)).toBe("ch1");
  });

  it.each([
    ["/clients", "app/(dashboard)/clients/page.tsx"],
    ["/create", "app/(dashboard)/create/page.tsx"],
    ["/rescue", "app/(dashboard)/rescue/page.tsx"],
    ["/evaluate", "app/(dashboard)/evaluate/page.tsx"],
    ["/dashboard", "app/(dashboard)/dashboard/page.tsx"],
  ])("%s は、今の画面の見出しの「この画面の使い方」（%s）と同じ章へ飛ぶ", (path, file) => {
    // 使い方への入口を上の帯へ移しても、行き先が変わらないことの確認。
    // 見出しの helpAnchor を外すスライスでは、このテストも意図して書き換える。
    const source = readFileSync(join(ROOT, file), "utf8");
    const anchors = [...source.matchAll(/helpAnchor="(ch\d+)"/g)].map((m) => m[1]);
    expect(anchors).toHaveLength(1);
    expect(helpAnchorOf(path)).toBe(anchors[0]);
  });

  it("返す章は、使い方（lib/manual/content.ts）に実在する", () => {
    const chapterIds = new Set(MANUAL_CHAPTERS.map((c) => c.id));
    const paths = ["/clients", "/clients/x", "/create", "/rescue", "/evaluate", "/dashboard"];
    for (const path of paths) {
      for (const mode of [undefined, BUNDLE_MODE]) {
        const anchor = helpAnchorOf(path, mode);
        expect(anchor).not.toBeNull();
        expect(chapterIds.has(anchor as string)).toBe(true);
      }
    }
  });
});
