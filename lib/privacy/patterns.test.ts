import { describe, expect, it } from "vitest";
import {
  detectPatterns,
  hasLongDigitRun,
  maskPatterns,
  normalizeDigitSeparators,
} from "./patterns";
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

describe("表記ゆれ（独立審査 2026-09-11 critical #8・D24）", () => {
  it("ドット区切り・+81・「TEL:」直後の詰めた番号も電話番号として消す", () => {
    const { text } = mask(
      "090.1234.5678 / +81 90-1234-5678 / TEL:0901234-5678 / 電話 06(1234)5678 / 携帯 0901234 5678",
    );
    // 札の番号はルールの適用順（+81 → 一般 → TEL直後）なので順不同。全部消えることを確かめる
    expect(text).not.toMatch(/\d{4}/);
    expect(text.match(/〔電話番号\d〕/g)).toHaveLength(5);
  });

  it("「TEL:」直後でも10〜11桁でなければ電話番号にしない・小数は壊さない", () => {
    expect(mask("TEL:012-345 と 体重52.3kg").text).toBe("TEL:012-345 と 体重52.3kg");
  });

  it("YYYY/M/D と YYYY.M.D の生年月日（文脈語つき）を消す", () => {
    expect(mask("生年月日 1950/3/4、誕生日 1950.03.04").text).toBe("〔生年月日1〕、〔生年月日2〕");
  });

  it("4桁-4桁-4桁（空白・ハイフン）のマイナンバー形を〔番号〕にする", () => {
    expect(mask("番号 1234 5678 9012 と 1234-5678-9012").text).toBe("番号 〔番号1〕 と 〔番号2〕");
  });

  it("normalizeDigitSeparators: 数字の間の長音・ダッシュをハイフンにし、ゼロ幅文字を除く", () => {
    expect(normalizeDigitSeparators("090ー1234−5678\u200bです")).toBe("090-1234-5678です");
    expect(normalizeDigitSeparators("2〜3回")).toBe("2〜3回"); // 波ダッシュは対象外（範囲の意味を保つ）
  });

  it("中黒や複数の空白で区切られた番号も電話番号として消す（CI 審査 2026-09-12）", () => {
    expect(mask("連絡先 090 ・ 1234 ・ 5678 と 06 - 1234 - 5678").text).toBe(
      "連絡先 〔電話番号1〕 と 〔電話番号2〕",
    );
  });

  it("hasLongDigitRun: 区切りを無視して10桁以上なら true、日付・時刻は false", () => {
    expect(hasLongDigitRun("90 ・ 1234 ・ 5678")).toBe(true);
    expect(hasLongDigitRun("2026-09-11 14:30 に 2026-09-30 10:00 訪問")).toBe(false);
    expect(hasLongDigitRun("90-1234-5678")).toBe(true);
    expect(hasLongDigitRun("0901234-5678")).toBe(true);
    expect(hasLongDigitRun("2026-09-11 14:30 に 2026-09-30")).toBe(false);
    expect(hasLongDigitRun("要介護2・週3回・体重52.3kg")).toBe(false);
  });
});
