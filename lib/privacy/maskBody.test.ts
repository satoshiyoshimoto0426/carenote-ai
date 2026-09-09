import { describe, expect, it } from "vitest";
import { maskRequestBody } from "./maskBody";
import { expandAliasVariants } from "./pseudonymize";
import { createPiiVault } from "./vault";

const aliases = expandAliasVariants([{ real: "山田花子", code: "A様" }]);

describe("本文の一括黒塗り: maskRequestBody", () => {
  it("文字列フィールドだけを黒塗りし、documentType は触らず、件数を種類ごとに合算する", () => {
    const vault = createPiiVault();
    const r = maskRequestBody(
      {
        documentType: "supportLog",
        clientInfo: "山田花子 85歳",
        supportNotes: "長女 090-1111-2222 と自宅 06-3333-4444 に連絡。",
        count: 3,
      },
      aliases,
      vault,
    );
    expect(r.body.documentType).toBe("supportLog");
    expect(r.body.count).toBe(3);
    expect(r.fields.clientInfo).toBe("A様 85歳");
    expect(r.fields.supportNotes).toBe("長女 〔電話番号1〕 と自宅 〔電話番号2〕 に連絡。");
    expect(r.findings).toEqual({ names: 1, patterns: [{ kind: "phone", count: 2 }] });
    expect(vault.size).toBe(2);
  });
});
