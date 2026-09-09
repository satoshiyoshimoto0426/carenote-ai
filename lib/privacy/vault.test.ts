import { describe, expect, it } from "vitest";
import { createPiiVault, restoreDeep } from "./vault";

describe("札入れ: createPiiVault", () => {
  it("種類ごとに1から連番の札を発行し、同じ値には同じ札を返す", () => {
    const v = createPiiVault();
    expect(v.tokenFor("phone", "090-1111-2222")).toBe("〔電話番号1〕");
    expect(v.tokenFor("phone", "06-3333-4444")).toBe("〔電話番号2〕");
    expect(v.tokenFor("phone", "090-1111-2222")).toBe("〔電話番号1〕");
    expect(v.tokenFor("address", "大阪府大阪市北区梅田1-2-3")).toBe("〔住所1〕");
    expect(v.size).toBe(3);
  });

  it("札を元の値へ戻す（1と10を取り違えない）", () => {
    const v = createPiiVault();
    for (let i = 1; i <= 10; i++) v.tokenFor("phone", `090-0000-${String(i).padStart(4, "0")}`);
    expect(v.restore("折り返し〔電話番号1〕と〔電話番号10〕")).toBe(
      "折り返し090-0000-0001と090-0000-0010",
    );
  });
});

describe("札入れ: restoreDeep（帳票JSONの中の文字列をすべて戻す）", () => {
  it("入れ子のオブジェクト・配列の文字列を戻し、文字列以外は触らない", () => {
    const v = createPiiVault();
    const t = v.tokenFor("phone", "090-1111-2222");
    const draft = {
      entries: [{ date: "2026-09-12", body: `長女へ折り返し ${t}`, priority: 2, done: false }],
      note: null,
      nested: { deeper: [t] },
    };
    expect(restoreDeep(draft, v)).toEqual({
      entries: [
        { date: "2026-09-12", body: "長女へ折り返し 090-1111-2222", priority: 2, done: false },
      ],
      note: null,
      nested: { deeper: ["090-1111-2222"] },
    });
  });
});
