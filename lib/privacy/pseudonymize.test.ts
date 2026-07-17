import { describe, expect, it } from "vitest";
import { maskNames, type NameAlias, nextClientCode, restoreNames } from "./pseudonymize";

const aliases: NameAlias[] = [
  { real: "山田太郎", code: "A様" },
  { real: "山田", code: "B様" }, // 部分一致のひっかけ（長い方を優先すべき）
];

describe("仮名化: maskNames / restoreNames", () => {
  it("実名を記号へ置換する（長い実名を優先）", () => {
    const masked = maskNames("山田太郎さんと山田さんが面談。", aliases);
    expect(masked).toBe("A様さんとB様さんが面談。");
    expect(masked).not.toContain("山田");
  });

  it("記号を実名へ復元する", () => {
    expect(restoreNames("A様の意向", aliases)).toBe("山田太郎の意向");
  });

  it("空の実名は無視する", () => {
    expect(maskNames("テスト", [{ real: "", code: "X様" }])).toBe("テスト");
  });
});

describe("仮名化: nextClientCode", () => {
  it("連番をA,B,...,Z,AAに変換する", () => {
    expect(nextClientCode(0)).toBe("A");
    expect(nextClientCode(1)).toBe("B");
    expect(nextClientCode(25)).toBe("Z");
    expect(nextClientCode(26)).toBe("AA");
    expect(nextClientCode(27)).toBe("AB");
  });
});
