import { describe, expect, it } from "vitest";
import { maskPii } from "./maskPii";
import { expandAliasVariants, relatedAliasCode, restoreNames } from "./pseudonymize";

describe("関係者名簿: relatedAliasCode と黒塗り", () => {
  it("利用者記号＋続柄で記号を作る（空白・改行は整える）", () => {
    expect(relatedAliasCode("A", "長女")).toBe("A様の長女");
    expect(relatedAliasCode("B", " 担当ケアマネ\n")).toBe("B様の担当ケアマネ");
  });

  it("登録した家族名がメモから消え、復元もできる", () => {
    const aliases = expandAliasVariants([
      { real: "山田 花子", code: "A様" },
      { real: "佐藤 一郎", code: relatedAliasCode("A", "長男") },
    ]);
    const { text, findings } = maskPii("山田花子さんの長男の佐藤一郎さんより電話。", aliases);
    expect(text).toBe("A様さんの長男のA様の長男さんより電話。");
    expect(text).not.toContain("佐藤");
    expect(findings.names).toBe(2);
    expect(restoreNames(text, aliases)).toContain("佐藤 一郎");
  });
});
