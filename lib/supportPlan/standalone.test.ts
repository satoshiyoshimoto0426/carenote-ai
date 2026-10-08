import { describe, expect, it } from "vitest";
import {
  clientInfoOf,
  defaultClientLabel,
  defaultPeriod,
  emptyForm,
  formProblems,
  hasBasicInput,
  metaOf,
  normalizeClientCode,
  rosterOf,
  type SupportPlanAForm,
} from "./standalone";

/** 単独の画面（app/support-plan-a/）の入力欄の値の組み立て。すべて架空の利用者 K-014。 */

const filled = (): SupportPlanAForm => ({
  ...emptyForm(new Date(2026, 9, 3)),
  clientCode: "K-014",
  basic: {
    age: "28歳",
    disabilityType: "  知的障害  ",
    hourlyWage: "",
    contractType: "雇用契約（A型）",
  },
});

describe("計画期間の初期値", () => {
  it("来月1日から、6か月後の前日（月末）まで", () => {
    expect(defaultPeriod(new Date(2026, 9, 3))).toEqual({
      periodStart: "2026-11-01",
      periodEnd: "2027-04-30",
    });
  });
  it("月末の面談でも、年をまたいでも暦がずれない（12/31 → 翌1/1〜6/30）", () => {
    expect(defaultPeriod(new Date(2026, 11, 31))).toEqual({
      periodStart: "2027-01-01",
      periodEnd: "2027-06-30",
    });
  });
  it("終わりが2月になるときは2月の末日（8/31 → 9/1〜翌2/28）", () => {
    expect(defaultPeriod(new Date(2026, 7, 31))).toEqual({
      periodStart: "2026-09-01",
      periodEnd: "2027-02-28",
    });
  });
});

describe("作る前に直してほしい所", () => {
  it("埋まっていれば何も出さない", () => {
    expect(formProblems(filled())).toEqual([]);
  });
  it("利用者コードが空なら止める", () => {
    expect(formProblems({ ...filled(), clientCode: " " })[0]).toContain("利用者コード");
  });
  it("利用者コードは英数字とハイフンだけ（漢字・かな・空白の入った氏名は止める ── ID化の原則）", () => {
    for (const name of [
      "山田太郎",
      "やまだ",
      "ヤマダ",
      "山田",
      "Yamada Taro",
      "K_014",
      "K-014様",
    ]) {
      expect(formProblems({ ...filled(), clientCode: name })[0]).toContain("英数字とハイフン");
    }
    for (const ok of ["K-014", "k014", "A-2026-07", "12345"]) {
      expect(formProblems({ ...filled(), clientCode: ok })).toEqual([]);
    }
  });
  it("利用者コードは20字まで", () => {
    expect(formProblems({ ...filled(), clientCode: "A".repeat(20) })).toEqual([]);
    expect(formProblems({ ...filled(), clientCode: "A".repeat(21) })[0]).toContain("20字");
  });
  it("全角で打った英数字・ハイフンは半角に直して受け付ける", () => {
    expect(normalizeClientCode(" Ｋ－０１４ ")).toBe("K-014");
    expect(formProblems({ ...filled(), clientCode: "Ｋ－０１４" })).toEqual([]);
  });
  it("表紙の呼び名は20字まで", () => {
    expect(formProblems({ ...filled(), clientLabel: "利用者K" })).toEqual([]);
    expect(formProblems({ ...filled(), clientLabel: "あ".repeat(21) })[0]).toContain("呼び名");
  });
  it("計画期間の終わりが始まりより前なら止める", () => {
    expect(formProblems({ ...filled(), periodEnd: "2026-01-01" })[0]).toContain("終わり");
  });
});

describe("AI に渡す基本情報・様式の値", () => {
  it("入っている欄だけを、前後の空白を除いて並べる（空の欄・利用者コードは渡さない）", () => {
    const info = clientInfoOf(filled());
    expect(info).toBe("年齢: 28歳\n障害種別: 知的障害\n契約形態: 雇用契約（A型）");
    expect(info).not.toContain("K-014");
  });
  it("家族が同席したら、そのことも渡す", () => {
    expect(clientInfoOf({ ...filled(), familyPresent: true })).toContain("家族の同席: あり");
  });
  it("1章の名簿の値は空の欄を持たない（様式の側で面談の話・要記入に回す）", () => {
    expect(rosterOf(filled())).toEqual({
      age: "28歳",
      disabilityType: "知的障害",
      contractType: "雇用契約（A型）",
    });
  });
  it("録音したかで出典の書き方を変え、計画番号が空なら手書きの欄にする", () => {
    expect(metaOf(filled(), true).sourceLabel).toBe(
      "面談の録音の文字起こし（K-014 アセスメント面談）",
    );
    expect(metaOf(filled(), false).sourceLabel).toBe("面談の記録（K-014 アセスメント面談）");
    expect(metaOf(filled(), true).planNumber).toBeUndefined();
    expect(metaOf({ ...filled(), planNumber: " 3 " }, true).planNumber).toBe("3");
  });
  it("表紙の呼び名は、空なら「利用者」＋利用者コードの先頭の英字、入れたらその呼び名", () => {
    expect(metaOf(filled(), true).clientLabel).toBe("利用者K");
    expect(metaOf({ ...filled(), clientLabel: " Kさん " }, true).clientLabel).toBe("Kさん");
    expect(defaultClientLabel("k-014")).toBe("利用者K");
    expect(defaultClientLabel("2026-07")).toBe("利用者");
  });
  it("様式に書く利用者コードは、全角を半角に直した形", () => {
    expect(metaOf({ ...filled(), clientCode: "Ｋ－０１４" }, true).clientCode).toBe("K-014");
    expect(metaOf({ ...filled(), clientCode: "Ｋ－０１４" }, true).sourceLabel).toBe(
      "面談の録音の文字起こし（K-014 アセスメント面談）",
    );
  });
});

describe("基本情報を入れたか（面談の進め方の「1. 基本情報」の目安）", () => {
  it("開いたときの既定（契約形態だけ）は、入れたことにしない", () => {
    expect(hasBasicInput(emptyForm(new Date(2026, 9, 3)))).toBe(false);
  });
  it("契約形態のほかに1つでも入れたら、入れたことにする（空白だけは数えない）", () => {
    expect(hasBasicInput(filled())).toBe(true);
    const blank = { ...filled(), basic: { contractType: "雇用契約（A型）", age: "  " } };
    expect(hasBasicInput(blank)).toBe(false);
  });
});
