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
