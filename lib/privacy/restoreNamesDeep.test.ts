import { describe, expect, it } from "vitest";
import { restoreNamesDeep } from "./pseudonymize";

const aliases = [
  { real: "山田 花子", code: "A様" },
  { real: "佐藤 一郎", code: "B様" },
];

describe("フル版表示: restoreNamesDeep（帳票JSONの記号→実名）", () => {
  it("入れ子の文字列をすべて実名に戻し、文字列以外は触らない", () => {
    const draft = {
      entries: [{ date: "2026-09-12", body: "A様の長女より電話。B様と同席。", done: false }],
      itemsToConfirm: ["A様の折り返し先"],
      count: 2,
    };
    expect(restoreNamesDeep(draft, aliases)).toEqual({
      entries: [
        { date: "2026-09-12", body: "山田 花子の長女より電話。佐藤 一郎と同席。", done: false },
      ],
      itemsToConfirm: ["山田 花子の折り返し先"],
      count: 2,
    });
  });

  it("対応表が空なら何も変えない", () => {
    expect(restoreNamesDeep({ body: "A様" }, [])).toEqual({ body: "A様" });
  });
});
