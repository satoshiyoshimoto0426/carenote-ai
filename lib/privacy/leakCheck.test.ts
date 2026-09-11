import { describe, expect, it } from "vitest";
import { assertNoLeak, findLeaks, PiiLeakError } from "./leakCheck";
import type { NameAlias } from "./pseudonymize";

const aliases: NameAlias[] = [
  { real: "山田花子", code: "A様" },
  { real: "李", code: "B様" }, // 1文字は判定対象外
];

describe("漏れ検査: findLeaks / assertNoLeak", () => {
  it("黒塗り済みなら何も返さない", () => {
    expect(findLeaks("A様より電話。〔電話番号〕へ折り返し。", aliases)).toEqual({
      names: [],
      patterns: [],
    });
    expect(() => assertNoLeak("A様より電話。", aliases)).not.toThrow();
  });

  it("実名が残っていれば検出し、例外を投げる（message に実名を含めない）", () => {
    const report = findLeaks("山田花子さんより電話。", aliases);
    expect(report.names).toEqual(["山田花子"]);
    let caught: unknown;
    try {
      assertNoLeak("山田花子さんより電話。", aliases);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PiiLeakError);
    expect((caught as PiiLeakError).message).not.toContain("山田花子");
    expect((caught as PiiLeakError).report.names).toHaveLength(1);
  });

  it("型が残っていれば検出する", () => {
    const report = findLeaks("A様の番号は 090-1234-5678", aliases);
    expect(report.patterns).toEqual(["phone"]);
    expect(() => assertNoLeak("A様の番号は 090-1234-5678", aliases)).toThrow(PiiLeakError);
  });

  it("1文字の実名は誤検知が多いため判定しない", () => {
    expect(findLeaks("李さん", aliases).names).toEqual([]);
  });
});

describe("置換と検査の同一原点を断つ（独立審査 2026-09-11 critical #8・D23）", () => {
  it("置換ルールが拾えない0落ちの番号でも、10桁以上の数字列として止める", () => {
    expect(findLeaks("折り返し 90-1234-5678", aliases).patterns).toEqual(["number"]);
    expect(() => assertNoLeak("番号は 0901234-5678", aliases)).toThrow(PiiLeakError);
  });

  it("実名の途中に空白・ゼロ幅文字・旧字体の揺れがあっても検出する", () => {
    const a: NameAlias[] = [{ real: "高橋一郎", code: "C様" }];
    expect(findLeaks("髙橋 一郎さん", a).names).toEqual(["高橋一郎"]);
    expect(findLeaks("高\u200b橋一郎", a).names).toEqual(["高橋一郎"]);
    expect(findLeaks("高橋さん", a).names).toEqual([]);
  });

  it("2文字の実名も判定対象になる（境界値）", () => {
    expect(findLeaks("田中さんより", [{ real: "田中", code: "D様" }]).names).toEqual(["田中"]);
  });
});
