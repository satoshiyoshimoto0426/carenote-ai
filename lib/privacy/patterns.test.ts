import { describe, expect, it } from "vitest";
import { detectPatterns, maskPatterns } from "./patterns";

describe("型置換: maskPatterns", () => {
  it("電話番号（ハイフン・括弧・フリーダイヤル）を消す", () => {
    const { text, findings } = maskPatterns(
      "連絡先は090-1234-5678、事業所は06(1234)5678、相談は0120-123-456です。",
    );
    expect(text).toBe("連絡先は〔電話番号〕、事業所は〔電話番号〕、相談は〔電話番号〕です。");
    expect(findings).toContainEqual({ kind: "phone", count: 3 });
  });

  it("郵便番号とメールを消す", () => {
    const { text } = maskPatterns("〒530-0001 送付先 taro@example.co.jp");
    expect(text).toBe("〔郵便番号〕 送付先 〔メール〕");
  });

  it("番地を含む住所を消し、数字の無い地名は残す", () => {
    const { text } = maskPatterns("大阪府大阪市北区梅田1-2-3に転居。大阪府の事業所に紹介。");
    expect(text).toBe("〔住所〕に転居。大阪府の事業所に紹介。");
  });

  it("文脈語つきの生年月日と、昭和の年月日を消す", () => {
    const { text } = maskPatterns("生年月日：1950年3月4日。昭和25年3月4日生。");
    expect(text).toBe("〔生年月日〕。〔生年月日〕生。");
  });

  it("予定の日付は消さない（カレンダー登録と支援経過の日付を壊さない）", () => {
    const { text, findings } = maskPatterns("9月12日14時に面談。次回は令和8年10月1日。");
    expect(text).toBe("9月12日14時に面談。次回は令和8年10月1日。");
    expect(findings).toHaveLength(0);
  });

  it("被保険者番号などの8〜12桁を消し、短い数字は残す", () => {
    const { text } = maskPatterns("被保険者番号 0123456789、要介護2、利用回数12回");
    expect(text).toBe("被保険者番号 〔番号〕、要介護2、利用回数12回");
  });

  it("何も無ければ原文のまま・findings は空", () => {
    const r = maskPatterns("A様より入浴の希望あり。");
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
