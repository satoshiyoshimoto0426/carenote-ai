import { describe, expect, it } from "vitest";
import { buildSupportPlanAView, SUPPORT_PLAN_A_CHAPTERS } from "./format";
import { groupPendingByChapter, pendingFields } from "./pending";
import { emptyDraft, SAMPLE_META, sampleDraft } from "./testFixtures";

/** 原案の画面の右に出す「要記入」の一覧。すべて架空の利用者 K-014。 */

const labelsOf = (fields: ReturnType<typeof pendingFields>) =>
  fields.map((f) => `${f.chapter}｜${f.label}`);

describe("「要記入」の一覧", () => {
  it("中身の詰まった原案でも、手書きにする欄（生年月日・担当者・支援の体制・次回の見直し）は並ぶ", () => {
    const got = labelsOf(pendingFields(buildSupportPlanAView(sampleDraft(), SAMPLE_META)));
    expect(got).toEqual(
      expect.arrayContaining([
        "1. 基本情報｜計画番号",
        "1. 基本情報｜生年月日",
        "6. 短期目標と支援内容｜短期目標① 担当者",
        "6. 短期目標と支援内容｜短期目標② 担当者",
        "7. サービスの内容及び支援の体制｜支援の体制",
        "9. モニタリングの時期・方法｜モニタリングの時期",
        "10. 同意・署名｜次回見直し予定日",
      ]),
    );
    // 埋まっている欄は並べない
    expect(got).not.toContain("1. 基本情報｜年齢");
    expect(got).not.toContain("4. 総合的な援助方針｜総合的な援助方針");
  });

  it("「要確認」は拾わない（家族が同席していない面談の家族の意向・関係機関は、確認のお願いが受け持つ）", () => {
    const got = labelsOf(pendingFields(buildSupportPlanAView(sampleDraft(), SAMPLE_META)));
    expect(got.some((l) => l.startsWith("2. "))).toBe(false);
    expect(got.some((l) => l.startsWith("8. "))).toBe(false);
  });

  it("AI が書けなかった欄は、その章の欄の名前で並ぶ", () => {
    const draft = sampleDraft();
    draft.policy = "";
    draft.intentions.work = " ";
    const got = labelsOf(pendingFields(buildSupportPlanAView(draft, SAMPLE_META)));
    expect(got).toContain("4. 総合的な援助方針｜総合的な援助方針");
    expect(got).toContain("2. 利用者及び家族の意向｜就労に関する希望・意向");
  });

  it("家族が同席したのに家族の意向が無ければ、要記入として並ぶ", () => {
    const got = labelsOf(
      pendingFields(buildSupportPlanAView(sampleDraft(), { ...SAMPLE_META, familyPresent: true })),
    );
    expect(got).toContain("2. 利用者及び家族の意向｜家族の意向（※同席時）");
  });

  it("何も分からなかった原案では、3章の表・短期目標の名前も並び、並びは様式の章の順", () => {
    const fields = pendingFields(buildSupportPlanAView(emptyDraft(), SAMPLE_META));
    const got = labelsOf(fields);
    expect(got).toContain("3. 課題・ニーズの整理｜3-1. 作業面の課題・ニーズ");
    expect(got).toContain("6. 短期目標と支援内容｜短期目標① 目標の名前");
    expect(got).toContain("9. モニタリングの時期・方法｜評価の基準");
    const order = fields.map((f) =>
      SUPPORT_PLAN_A_CHAPTERS.indexOf(f.chapter as (typeof SUPPORT_PLAN_A_CHAPTERS)[number]),
    );
    expect(order.every((n) => n >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("章ごとにまとめる（画面の右の一覧）", () => {
  it("同じ章の欄を1つにまとめ、章の順と欄の順はそのまま", () => {
    expect(
      groupPendingByChapter([
        { chapter: "1. 基本情報", label: "計画番号" },
        { chapter: "1. 基本情報", label: "生年月日" },
        { chapter: "6. 短期目標と支援内容", label: "短期目標① 担当者" },
      ]),
    ).toEqual([
      { chapter: "1. 基本情報", labels: ["計画番号", "生年月日"] },
      { chapter: "6. 短期目標と支援内容", labels: ["短期目標① 担当者"] },
    ]);
  });

  it("何も無ければ空", () => {
    expect(groupPendingByChapter([])).toEqual([]);
  });
});
