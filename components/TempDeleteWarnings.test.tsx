import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { attrOf, elementsOf, isReachable, textOf } from "@/tests/helpers/markup";
import TempDeleteWarnings, { warningsOf } from "./TempDeleteWarnings";

/**
 * 一時保管の削除に失敗したときの警告（2026-09-25・データ取扱説明書の「削除に失敗した時は画面に警告」の約束）。
 * 描いた HTML は木として読む（CLAUDE.md の決まり）。「出ている」は textOf と isReachable、「出していない」は HTML 全体で見る。
 */
const WARN =
  "資料の一時保管の削除に失敗しました。管理者に Vercel Blob の該当ファイルの削除を依頼してください。";

describe("TempDeleteWarnings", () => {
  it("警告があれば、読み上げにも届く警告の枠（role=alert）の中に文が出る", () => {
    const html = renderToStaticMarkup(createElement(TempDeleteWarnings, { warnings: [WARN] }));
    const alerts = elementsOf(html).filter((e) => attrOf(e, "role") === "alert" && isReachable(e));
    expect(alerts).toHaveLength(1);
    expect(textOf(alerts[0])).toContain("一時保管の削除に失敗しました");
  });

  it("警告が無ければ何も描かない（場所も取らない）", () => {
    const html = renderToStaticMarkup(createElement(TempDeleteWarnings, { warnings: [] }));
    expect(html).toBe("");
  });
});

describe("warningsOf（返事から警告を取り出す）", () => {
  it("文字列の配列だけを取り出す", () => {
    expect(warningsOf({ total_score: 1, warnings: [WARN] })).toEqual([WARN]);
    expect(warningsOf({ error: "x", warnings: [WARN, 3, null] })).toEqual([WARN]);
  });

  it("警告が無い・形が違う返事では空（画面を落とさない）", () => {
    expect(warningsOf({ total_score: 1 })).toEqual([]);
    expect(warningsOf({ warnings: "x" })).toEqual([]);
    expect(warningsOf(null)).toEqual([]);
    expect(warningsOf("x")).toEqual([]);
  });
});
