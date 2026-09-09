import { describe, expect, it } from "vitest";
import { detectPatterns, maskPatterns } from "./patterns";
import { createPiiVault } from "./vault";

const mask = (text: string) => maskPatterns(text, createPiiVault());

describe("型置換: maskPatterns", () => {
  it("電話番号（ハイフン・括弧・フリーダイヤル）を札に置き換える", () => {
    const { text, findings } = mask(
      "連絡先は090-1234-5678、事業所は06(1234)5678、相談は0120-123-456です。",
    );
    expect(text).toBe("連絡先は〔電話番号1〕、事業所は〔電話番号2〕、相談は〔電話番号3〕です。");
    expect(findings).toContainEqual({ kind: "phone", count: 3 });
  });

  it("同じ番号が2回出ても同じ札になる", () => {
    const { text } = mask("090-1234-5678 に電話。折り返しも 090-1234-5678。");
    expect(text).toBe("〔電話番号1〕 に電話。折り返しも 〔電話番号1〕。");
  });

  it("郵便番号とメールを消す", () => {
    const { text } = mask("〒530-0001 送付先 taro@example.co.jp");
    expect(text).toBe("〔郵便番号1〕 送付先 〔メール1〕");
  });

  it("番地を含む住所を消し、数字の無い地名は残す", () => {
    const { text } = mask("大阪府大阪市北区梅田1-2-3に転居。大阪府の事業所に紹介。");
    expect(text).toBe("〔住所1〕に転居。大阪府の事業所に紹介。");
  });

  it("文脈語つきの生年月日と、昭和の年月日を消す", () => {
    const { text } = mask("生年月日：1950年3月4日。昭和25年3月4日生。");
    expect(text).toBe("〔生年月日1〕。〔生年月日2〕生。");
  });

  it("予定の日付は消さない（カレンダー登録と支援経過の日付を壊さない）", () => {
    const { text, findings } = mask("9月12日14時に面談。次回は令和8年10月1日。");
    expect(text).toBe("9月12日14時に面談。次回は令和8年10月1日。");
    expect(findings).toHaveLength(0);
  });

  it("被保険者番号などの8〜12桁を消し、短い数字は残す", () => {
    const { text } = mask("被保険者番号 0123456789、要介護2、利用回数12回");
    expect(text).toBe("被保険者番号 〔番号1〕、要介護2、利用回数12回");
  });

  it("何も無ければ原文のまま・findings は空", () => {
    const r = mask("A様より入浴の希望あり。");
    expect(r.text).toBe("A様より入浴の希望あり。");
    expect(r.findings).toEqual([]);
  });
});

describe("型検出: detectPatterns（漏れ検査用）", () => {
  it("残っている型の種類だけを返す", () => {
    expect(detectPatterns("電話 090-1234-5678")).toEqual(["phone"]);
    expect(detectPatterns("A様と面談")).toEqual([]);
  });
});
