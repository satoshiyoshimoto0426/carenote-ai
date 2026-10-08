import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildSupportPlanAView } from "@/lib/supportPlan/format";
import { SAMPLE_META, sampleDraft } from "@/lib/supportPlan/testFixtures";
import { attrOf, elementsOf, hasClass, textOf } from "@/tests/helpers/markup";
import SupportPlanDocument from "./SupportPlanDocument";

/**
 * 様式に忠実か（営業チームの依頼「添付の様式に忠実に準拠」・2026-10-03）。
 * 下の一覧は、事業所の様式「個別支援計画書（就労継続支援A型事業所）」から一字一句写した正本。
 * 描いた HTML を木として読み、章・欄の名前と並び順がこれと同じであることを確かめる。
 */
const CHAPTERS = [
  "1. 基本情報",
  "2. 利用者及び家族の意向",
  "3. 課題・ニーズの整理",
  "4. 総合的な援助方針",
  "5. 長期目標",
  "6. 短期目標と支援内容",
  "7. サービスの内容及び支援の体制",
  "8. 関係機関との連携",
  "9. モニタリングの時期・方法",
  "10. 同意・署名",
];

/** 見出し列（th）の名前を、上から順に（表の見出し行「課題」「本人のニーズ・支援の方向性」も含む） */
const LABELS = [
  // 1. 基本情報
  "利用者コード",
  "計画番号",
  "氏名（※対応表で管理）",
  "生年月日",
  "年齢",
  "性別",
  "障害種別",
  "障害等級・手帳",
  "受給者証番号",
  "契約形態",
  "入所年月日",
  "通所歴",
  "勤務日数",
  "勤務時間",
  "時給",
  "月平均賃金",
  // 2. 意向
  "就労に関する希望・意向",
  "生活に関する希望・意向",
  "その他の希望・意向",
  "家族の意向（※同席時）",
  // 3. 課題・ニーズ（3つの表）
  "課題",
  "本人のニーズ・支援の方向性",
  "課題",
  "本人のニーズ・支援の方向性",
  "課題",
  "本人のニーズ・支援の方向性",
  // 4・5
  "総合的な援助方針",
  "長期目標",
  "目標達成の目安",
  "長期目標の背景・根拠",
  // 6. 短期目標（見本の原案は2件）
  "目標の具体的内容",
  "支援内容",
  "支援方法・配慮事項",
  "評価の時期・方法",
  "担当者",
  "目標の具体的内容",
  "支援内容",
  "支援方法・配慮事項",
  "評価の時期・方法",
  "担当者",
  // 7
  "サービスの種類",
  "提供するサービス内容",
  "支援の体制",
  "勤務・作業の配慮",
  "健康面の配慮",
  "環境・設備の配慮",
  // 8
  "相談支援専門員",
  "主治医・医療機関",
  "家族",
  "その他の関係機関",
  // 9
  "モニタリングの時期",
  "モニタリングの方法",
  "計画見直しの基準",
  // 10
  "計画作成者",
  "作成日",
  "本人の同意",
  "家族の同意（※同席時）",
  "次回見直し予定日",
];

function draw(): ReturnType<typeof elementsOf> {
  const view = buildSupportPlanAView(sampleDraft(), SAMPLE_META);
  return elementsOf(
    `<div>${renderToStaticMarkup(createElement(SupportPlanDocument, { view }))}</div>`,
  );
}

describe("SupportPlanDocument: 様式の章と欄", () => {
  it("章の見出しが、様式と一字一句同じ順で並ぶ（目次の見出しを除く）", () => {
    const heads = draw().filter((e) => e.tagName === "h2" && attrOf(e, "id")?.startsWith("s"));
    expect(heads.map(textOf)).toEqual(CHAPTERS);
  });

  it("目次は10章を並べ、各章の見出しへの印（#s1〜#s10）を持つ（Paged.js がページ番号を入れる）", () => {
    const els = draw();
    const toc = els.find((e) => e.tagName === "ul" && hasClass(e, "toc"));
    if (!toc) throw new Error("目次が無い");
    // 描いた HTML の中のリンクは目次の分だけ（本文にリンクを置かない）
    const links = els.filter((e) => e.tagName === "a");
    expect(links.map(textOf)).toEqual(CHAPTERS);
    expect(links.map((a) => attrOf(a, "href"))).toEqual(CHAPTERS.map((_, i) => `#s${i + 1}`));
  });

  it("見出し列の名前が、様式と一字一句同じ順で並ぶ", () => {
    const ths = draw().filter((e) => e.tagName === "th");
    expect(ths.map(textOf)).toEqual(LABELS);
  });

  it("表紙は事業所の種類・題・利用者コードと「原案」を持つ", () => {
    const els = draw();
    const cover = els.find((e) => e.tagName === "section" && hasClass(e, "cover"));
    if (!cover) throw new Error("表紙が無い");
    const text = textOf(cover);
    expect(text).toContain("就労継続支援A型事業所");
    expect(text).toContain("個別支援計画書");
    expect(text).toContain("利用者K（K-014）／原案");
  });
});

describe("SupportPlanDocument: 印字しないもの", () => {
  it("原案の利用者名（記号や実名）を、どこにも印字しない（ID化の原則）", () => {
    const d = sampleDraft();
    d.clientName = "山田太郎";
    const view = buildSupportPlanAView(d, SAMPLE_META);
    const html = renderToStaticMarkup(createElement(SupportPlanDocument, { view }));
    expect(html).not.toContain("山田太郎");
  });
});
