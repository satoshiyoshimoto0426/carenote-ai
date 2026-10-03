import { describe, expect, it } from "vitest";
import { buildSupportPlanAView, jaDate, jaMonth, TBD } from "./format";
import { emptyDraft, SAMPLE_META, sampleDraft } from "./testFixtures";

/**
 * 様式の各欄の値の組み立て（lib/supportPlan/format.ts）。
 * 守ること: 空の欄は「要記入」・名簿の値が優先・氏名と受給者証番号は印字しない・評価の時期は計画期間から。
 */
const cell = (rows: readonly (readonly string[])[], label: string): string => {
  for (const r of rows) {
    const i = r.indexOf(label);
    if (i >= 0 && i % 2 === 0) return r[i + 1];
  }
  throw new Error(`欄が無い: ${label}`);
};

describe("buildSupportPlanAView: 空の欄", () => {
  it("面談で何も分からなければ、文字の欄はすべて「（要記入）」になる（空のまま描かない）", () => {
    const v = buildSupportPlanAView(emptyDraft(), SAMPLE_META);
    for (const label of [
      "年齢",
      "性別",
      "障害種別",
      "障害等級・手帳",
      "契約形態",
      "時給",
      "月平均賃金",
    ]) {
      expect(cell(v.basic.rows, label)).toBe(TBD);
    }
    expect(cell(v.intentions, "就労に関する希望・意向")).toBe(TBD);
    expect(cell(v.policy, "総合的な援助方針")).toBe(TBD);
    expect(cell(v.longTerm, "長期目標")).toBe(TBD);
    expect(v.monitoring.criteria).toBe(TBD);
  });

  it("課題の表が空でも、3つの面の表は消さず「（要記入）」の1行を置く", () => {
    const v = buildSupportPlanAView(emptyDraft(), SAMPLE_META);
    expect(v.needs.map((g) => g.title)).toEqual([
      "3-1. 作業面の課題・ニーズ",
      "3-2. 心理・社会参加面の課題・ニーズ",
      "3-3. 健康面の課題・ニーズ",
    ]);
    for (const g of v.needs) {
      expect(g.rows).toHaveLength(1);
      expect(g.rows[0].issue).toBe(TBD);
    }
  });

  it("短期目標が無くても、短期目標①の枠を「（要記入）」で1つ置く", () => {
    const v = buildSupportPlanAView(emptyDraft(), SAMPLE_META);
    expect(v.shortTerms).toHaveLength(1);
    expect(v.shortTerms[0].heading).toBe(`■ 短期目標①：${TBD}`);
  });
});

describe("buildSupportPlanAView: 名簿と ID化の原則", () => {
  it("1章は名簿の値を優先し、名簿が空の欄は原案の値を使う", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META, {
      hourlyWage: "1,300円",
      age: " ",
    });
    expect(cell(v.basic.rows, "時給")).toBe("1,300円");
    expect(cell(v.basic.rows, "年齢")).toBe("28歳");
  });

  it("氏名と受給者証番号は、原案や名簿に何があっても「（対応表で管理）」と書く", () => {
    const d = sampleDraft();
    d.clientName = "山田太郎";
    const v = buildSupportPlanAView(d, SAMPLE_META);
    expect(cell(v.basic.rows, "氏名（※対応表で管理）")).toBe("（対応表で管理）");
    expect(cell(v.basic.rows, "受給者証番号")).toBe("（対応表で管理）");
    expect(JSON.stringify(v)).not.toContain("山田太郎");
  });

  it("利用者コードは表紙と1章に出る", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    expect(v.cover.who).toBe("利用者K（K-014）／原案");
    expect(cell(v.basic.rows, "利用者コード")).toBe("K-014");
  });
});

describe("buildSupportPlanAView: 計画期間から決まる欄", () => {
  it("短期目標の評価の時期は、計画期間の終わりの月にする（AI に書かせない）", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    const evaluation = cell(v.shortTerms[0].rows, "評価の時期・方法");
    expect(evaluation.startsWith("2027年3月にモニタリング面談にて評価")).toBe(true);
    expect(evaluation).toContain("□5.上回る達成");
    expect(v.monitoring.timing).toBe("概ね6ヶ月ごと（次回：2027年3月＿＿日／要記入）");
  });

  it("計画期間と作成日は和暦でなく「2026年10月1日」の形で書く", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    expect(v.cover.rows).toContainEqual(["計画期間", "2026年10月1日 〜 2027年3月31日"]);
    expect(jaDate("2026-09-30")).toBe("2026年9月30日");
    expect(jaMonth("2027-03-31")).toBe("2027年3月");
  });

  it("計画番号は、無ければ手書きの空欄、あれば「第◯号」", () => {
    expect(cell(buildSupportPlanAView(sampleDraft(), SAMPLE_META).basic.rows, "計画番号")).toBe(
      "第＿＿号（要記入）",
    );
    const v = buildSupportPlanAView(sampleDraft(), { ...SAMPLE_META, planNumber: "12" });
    expect(cell(v.basic.rows, "計画番号")).toBe("第12号");
  });
});

describe("buildSupportPlanAView: 意向・担当者・連携", () => {
  it("家族が同席していなければ、家族の意向は「要確認」と書き、同意欄の「同席なし」に印を付ける", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    expect(cell(v.intentions, "家族の意向（※同席時）")).toContain("要確認");
    const family = v.consent.find((c) => c.label === "家族の同意（※同席時）");
    expect(family?.lines).toContain("☑同席なし");
  });

  it("家族が同席していれば、空の家族の意向は「（要記入）」で、「同席なし」に印を付けない", () => {
    const v = buildSupportPlanAView(sampleDraft(), { ...SAMPLE_META, familyPresent: true });
    expect(cell(v.intentions, "家族の意向（※同席時）")).toBe(TBD);
    const family = v.consent.find((c) => c.label === "家族の同意（※同席時）");
    expect(family?.lines).toContain("□同席なし");
  });

  it("担当者は職種だけを書き、名前は「要記入」にする", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    expect(cell(v.shortTerms[0].rows, "担当者")).toBe("支援担当者（職業指導員／要記入）");
    expect(cell(v.shortTerms[1].rows, "担当者")).toBe("支援担当者（要記入）");
  });

  it("連携の有無は ☑ と □ で書き、分からなければ「要確認」", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    const lines = (label: string) => v.liaison.find((l) => l.label === label)?.lines ?? [];
    expect(lines("相談支援専門員")[0]).toBe("☑連携あり　□なし");
    expect(lines("家族")[0]).toBe("□連携あり　□なし（要確認）");
    expect(lines("主治医・医療機関")[1]).toContain("医療機関名：心療内科クリニック");
  });

  it("短期目標の見出しは ①②③ の番号で並ぶ", () => {
    const v = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
    expect(v.shortTerms.map((g) => g.heading)).toEqual([
      "■ 短期目標①：データ入力を1回60分まで集中して続ける",
      "■ 短期目標②：困ったことを週1回の振り返り面談で伝える",
    ]);
  });
});
