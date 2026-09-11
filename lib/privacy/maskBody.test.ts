import { describe, expect, it } from "vitest";
import { PiiLeakError } from "./leakCheck";
import { maskDeep, maskRequestBody } from "./maskBody";
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

describe("入れ子の帳票を黒塗りする: maskDeep（critical #7 戻した draft を再送する経路）", () => {
  it("入れ子の文字列すべてを黒塗りし、文字列以外はそのまま", () => {
    const vault = createPiiVault();
    const draft = {
      clientName: "山田花子",
      overview: "緊急連絡先 090-1234-5678 住所 大阪府大阪市北区梅田1-2-3",
      domains: [{ domain: "健康状態", currentStatus: "血圧140/90", analysis: "" }],
      strengths: ["長女 06-1111-2222 が毎日訪問"],
      count: 2,
      flag: true,
    };
    const r = maskDeep(draft, aliases, vault);
    expect(r.clientName).toBe("A様");
    expect(r.overview).toBe("緊急連絡先 〔電話番号1〕 住所 〔住所1〕");
    expect(r.domains[0].currentStatus).toBe("血圧140/90");
    expect(r.strengths[0]).toBe("長女 〔電話番号2〕 が毎日訪問");
    expect(r.count).toBe(2);
    expect(r.flag).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/1234|山田/);
  });

  it("実名の設定ミスで残る形なら例外（fail-closed）", () => {
    expect(() =>
      maskDeep({ a: ["山田花子"] }, [{ real: "山田花子", code: "山田花子様" }], createPiiVault()),
    ).toThrow(PiiLeakError);
  });
});
