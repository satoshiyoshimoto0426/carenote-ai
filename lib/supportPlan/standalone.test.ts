import { describe, expect, it } from "vitest";
import {
  clientInfoOf,
  defaultPeriod,
  emptyForm,
  formProblems,
  metaOf,
  rosterOf,
  type SupportPlanAForm,
  supportPlanAMode,
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

describe("表示スイッチ", () => {
  it("on / standalone 以外（未設定・打ち間違い）は出さない", () => {
    expect(supportPlanAMode(undefined)).toBe("off");
    expect(supportPlanAMode("ON")).toBe("off");
    expect(supportPlanAMode("true")).toBe("off");
    expect(supportPlanAMode("on")).toBe("on");
    expect(supportPlanAMode("standalone")).toBe("standalone");
  });
});

describe("計画期間の初期値", () => {
  it("今日から6か月後の前日まで", () => {
    expect(defaultPeriod(new Date(2026, 9, 3))).toEqual({
      periodStart: "2026-10-03",
      periodEnd: "2027-04-02",
    });
  });
  it("月末から始めても暦がずれない（8/31 → 2/28）", () => {
    expect(defaultPeriod(new Date(2026, 7, 31)).periodEnd).toBe("2027-03-02");
  });
});

describe("作る前に直してほしい所", () => {
  it("埋まっていれば何も出さない", () => {
    expect(formProblems(filled())).toEqual([]);
  });
  it("利用者コードが空なら止める", () => {
    expect(formProblems({ ...filled(), clientCode: " " })[0]).toContain("利用者コード");
  });
  it("利用者コードに氏名のような文字があれば止める（ID化の原則）", () => {
    expect(formProblems({ ...filled(), clientCode: "山田太郎" })[0]).toContain("氏名");
    expect(formProblems({ ...filled(), clientCode: "やまだ" })[0]).toContain("氏名");
    expect(formProblems({ ...filled(), clientCode: "K-014" })).toEqual([]);
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
});
