import { describe, expect, it } from "vitest";
import {
  clientCodeIndex,
  expandAliasVariants,
  maskNames,
  type NameAlias,
  nameRegex,
  nextClientCode,
  restoreNames,
} from "./pseudonymize";

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

describe("仮名化: expandAliasVariants（表記ゆれ展開）", () => {
  it("空白あり・なしの両方を同じ記号に対応付ける", () => {
    const v = expandAliasVariants([{ real: "山田 花子", code: "A様" }]);
    expect(v).toContainEqual({ real: "山田 花子", code: "A様" });
    expect(v).toContainEqual({ real: "山田花子", code: "A様" });
  });

  it("展開した対応表で、メモ内の空白なし実名もマスクされる", () => {
    const v = expandAliasVariants([{ real: "山田 花子", code: "A様" }]);
    expect(maskNames("山田花子さんが来訪。", v)).toBe("A様さんが来訪。");
  });

  it("2文字未満・重複は除外する", () => {
    const v = expandAliasVariants([
      { real: "李", code: "B様" },
      { real: "山田 花子", code: "A様" },
      { real: "山田花子", code: "A様" },
    ]);
    expect(v.filter((a) => a.code === "B様")).toHaveLength(0);
    expect(v.filter((a) => a.real === "山田花子")).toHaveLength(1);
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

  it("clientCodeIndex は nextClientCode の逆（採番を最大＋1で決めるのに使う）", () => {
    for (let i = 0; i < 800; i++) {
      expect(clientCodeIndex(nextClientCode(i))).toBe(i);
    }
    expect(clientCodeIndex("A")).toBe(0);
    expect(clientCodeIndex("Z")).toBe(25);
    expect(clientCodeIndex("AA")).toBe(26);
  });

  it("想定外の記号は null（無視して採番を続けられるように）", () => {
    expect(clientCodeIndex("")).toBeNull();
    expect(clientCodeIndex("A1")).toBeNull();
    expect(clientCodeIndex("あ")).toBeNull();
    expect(clientCodeIndex("ABCDEFG")).toBeNull();
  });
});

describe("nameRegex: ゆるい一致（空白・ゼロ幅・旧字体）", () => {
  it("2文字未満は null、それ以外は空白類を挟んでも当たる", () => {
    expect(nameRegex("李")).toBeNull();
    const re = nameRegex("山田 花子");
    expect(re).not.toBeNull();
    expect("山田　花子".replace(re as RegExp, "A様")).toBe("A様");
    expect("山田花子".replace(re as RegExp, "A様")).toBe("A様");
  });

  it("旧字体・新字体を同一視し、正規表現の特殊文字も安全", () => {
    expect("齋藤".replace(nameRegex("斎藤") as RegExp, "B様")).toBe("B様");
    expect("a.b".replace(nameRegex("a.b") as RegExp, "X")).toBe("X");
    expect("axb".replace(nameRegex("a.b") as RegExp, "X")).toBe("axb");
  });
});
