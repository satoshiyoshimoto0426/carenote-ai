import { describe, expect, it } from "vitest";
import { PiiLeakError } from "./leakCheck";
import { maskPii } from "./maskPii";
import { expandAliasVariants } from "./pseudonymize";
import { createPiiVault, restoreDeep } from "./vault";

const aliases = expandAliasVariants([{ real: "山田 花子", code: "A様" }]);

describe("黒塗りの入口: maskPii（名簿 → 型 → 自己点検）", () => {
  it("電話連絡のメモから実名・番号・住所を消し、予定の日付は残す", () => {
    const memo =
      "山田花子さんの長女より電話（０９０−１２３４−５６７８）。9月12日14時に自宅（大阪府大阪市北区梅田1-2-3）で面談希望。";
    const { text, findings } = maskPii(memo, aliases);
    expect(text).toBe(
      "A様さんの長女より電話(〔電話番号1〕)。9月12日14時に自宅(〔住所1〕)で面談希望。",
    );
    expect(findings.names).toBe(1);
    expect(findings.patterns).toContainEqual({ kind: "phone", count: 1 });
    expect(findings.patterns).toContainEqual({ kind: "address", count: 1 });
  });

  it("二枚方式: AIの返事の札を手元で元の番号に戻せる（名前は記号のまま）", () => {
    const { text, vault } = maskPii("山田花子さん 090-1234-5678 へ折り返し", aliases);
    expect(text).toBe("A様さん 〔電話番号1〕 へ折り返し");
    const aiReply = { entries: [{ body: "A様の長女へ 〔電話番号1〕 に折り返し予定" }] };
    expect(restoreDeep(aiReply, vault)).toEqual({
      entries: [{ body: "A様の長女へ 090-1234-5678 に折り返し予定" }],
    });
  });

  it("複数フィールドで札入れを共有すると番号が衝突しない", () => {
    const vault = createPiiVault();
    const a = maskPii("自宅 06-1111-2222", aliases, vault);
    const b = maskPii("長女 090-3333-4444", aliases, vault);
    expect(a.text).toBe("自宅 〔電話番号1〕");
    expect(b.text).toBe("長女 〔電話番号2〕");
    expect(vault.restore("〔電話番号1〕／〔電話番号2〕")).toBe("06-1111-2222／090-3333-4444");
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
    expect(text).toBe("折り返し 〔電話番号1〕");
  });

  it("自己点検: 名簿の設定ミスで実名が残る形なら例外を投げて送信を止める（fail-closed）", () => {
    expect(() => maskPii("山田花子さん", [{ real: "山田花子", code: "山田花子様" }])).toThrow(
      PiiLeakError,
    );
  });
});
