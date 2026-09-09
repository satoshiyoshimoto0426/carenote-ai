import { describe, expect, it } from "vitest";
import { PiiLeakError } from "./leakCheck";
import { maskPii } from "./maskPii";
import { expandAliasVariants } from "./pseudonymize";

const aliases = expandAliasVariants([{ real: "山田 花子", code: "A様" }]);

describe("黒塗りの入口: maskPii（名簿 → 型 → 自己点検）", () => {
  it("電話連絡のメモから実名・番号・住所を消し、予定の日付は残す", () => {
    const memo =
      "山田花子さんの長女より電話（０９０−１２３４−５６７８）。9月12日14時に自宅（大阪府大阪市北区梅田1-2-3）で面談希望。";
    const { text, findings } = maskPii(memo, aliases);
    expect(text).toBe(
      "A様さんの長女より電話(〔電話番号〕)。9月12日14時に自宅(〔住所〕)で面談希望。",
    );
    expect(findings.names).toBe(1);
    expect(findings.patterns).toContainEqual({ kind: "phone", count: 1 });
    expect(findings.patterns).toContainEqual({ kind: "address", count: 1 });
  });

  it("全角の実名表記も NFKC で揃えて消す", () => {
    const { text } = maskPii("山田　花子さん来所。", aliases);
    expect(text).toBe("A様さん来所。");
  });

  it("findings は件数のみで原文を持たない", () => {
    const r = maskPii("山田花子 090-1234-5678", aliases);
    expect(JSON.stringify(r.findings)).not.toContain("山田");
    expect(JSON.stringify(r.findings)).not.toContain("1234");
  });

  it("名簿が空でも型置換と点検は動く", () => {
    const { text } = maskPii("折り返し 06-1234-5678", []);
    expect(text).toBe("折り返し 〔電話番号〕");
  });

  it("自己点検: 名簿の設定ミスで実名が残る形なら例外を投げて送信を止める（fail-closed）", () => {
    // 記号に実名が含まれる誤設定 → 置換後も実名が残る → 点検が止める
    expect(() => maskPii("山田花子さん", [{ real: "山田花子", code: "山田花子様" }])).toThrow(
      PiiLeakError,
    );
  });
});
