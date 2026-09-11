import { describe, expect, it } from "vitest";
import { composePersonaNotes } from "./rescue";
import { buildIntakePrompt, composeIntakeNotes, INTAKE_SYSTEM_PROMPT } from "./rescueIntake";

describe("提供書類の統合読解: buildIntakePrompt（純粋関数）", () => {
  it("書類名が番号付き一覧で入る", () => {
    const prompt = buildIntakePrompt(
      [{ name: "診療情報提供書.pdf" }, { name: "基本情報シート.pdf" }],
      "",
    );
    expect(prompt).toContain("提供書類（2件）");
    expect(prompt).toContain("1. 診療情報提供書.pdf");
    expect(prompt).toContain("2. 基本情報シート.pdf");
  });

  it("手打ち人物像があれば「ケアマネ入力・こちらを優先」として含める", () => {
    const personaNotes = composePersonaNotes({ medical: "脳梗塞の既往。降圧薬を服用。" });
    const prompt = buildIntakePrompt([{ name: "a.pdf" }], personaNotes);
    expect(prompt).toContain("手打ち入力（ケアマネ入力・こちらを優先）");
    expect(prompt).toContain("脳梗塞の既往。降圧薬を服用。");
  });

  it("手打ち人物像が空なら「資料のみから読み取る」と明示する（資料のみ生成）", () => {
    const prompt = buildIntakePrompt([{ name: "a.pdf" }], "");
    expect(prompt).toContain("今回は手打ち入力なし");
    expect(prompt).not.toContain("こちらを優先");
  });

  it("氏名を書き写さない指示（一般表現への置換）が入る", () => {
    const prompt = buildIntakePrompt([{ name: "a.pdf" }], "");
    expect(prompt).toContain("氏名などの固有名詞は書き写さず");
    expect(prompt).toContain("「本人」「長女」等の一般表現");
  });

  it("出典（書類名）付きサマリを求める指示が入る", () => {
    const prompt = buildIntakePrompt([{ name: "a.pdf" }], "");
    expect(prompt).toContain("出典＝書類名付き");
  });
});

describe("提供書類の統合読解: システムプロンプト", () => {
  it("固有名詞の非転記・出典付き抽出・矛盾のcautions化を指示している", () => {
    expect(INTAKE_SYSTEM_PROMPT).toContain(
      "氏名・住所・電話番号・保険番号などの固有名詞を書き写さないでください",
    );
    expect(INTAKE_SYSTEM_PROMPT).toContain("画像の場合は、写っている文字を丁寧に読み取って");
    expect(INTAKE_SYSTEM_PROMPT).toContain("conflicts");
    expect(INTAKE_SYSTEM_PROMPT).toContain("（出典: 書類名）");
    expect(INTAKE_SYSTEM_PROMPT).toContain("矛盾");
    expect(INTAKE_SYSTEM_PROMPT).toContain("cautions");
  });
});

describe("第6段 OCR統合: 種別ヒントと分類別メモ", () => {
  it("種別と形式（PDF/画像）と読みどころが書類一覧に入る", () => {
    const prompt = buildIntakePrompt(
      [
        { name: "意見書.jpg", docType: "主治医意見書", mediaType: "image/jpeg" },
        { name: "サマリー.pdf", docType: "看護サマリー", mediaType: "application/pdf" },
      ],
      "",
    );
    expect(prompt).toContain("1. 意見書.jpg（種別: 主治医意見書／画像）");
    expect(prompt).toContain("医学的管理の必要性");
    expect(prompt).toContain("2. サマリー.pdf（種別: 看護サマリー／PDF）");
    expect(prompt).toContain("看護問題");
    expect(prompt).toContain("facts");
    expect(prompt).toContain("conflicts");
  });

  it("composeIntakeNotes: 食い違いを冒頭に、事実を分類別に出典つきで並べる", () => {
    const notes = composeIntakeNotes({
      summary: "要約",
      cautions: [],
      facts: [
        {
          category: "処方・服薬",
          text: "降圧薬を朝1回内服",
          source: "主治医意見書",
          date: "2026-08-01",
        },
        { category: "心身機能・ADL", text: "歩行は見守りで可", source: "看護サマリー", date: "" },
      ],
      conflicts: [
        {
          topic: "歩行の自立度",
          statements: [
            { source: "主治医意見書", text: "自立" },
            { source: "看護サマリー", text: "見守り" },
          ],
          advice: "直近の状態を訪問看護に確認",
        },
      ],
      documents: [],
    });
    expect(notes.startsWith("## 資料間の食い違い")).toBe(true);
    expect(notes).toContain(
      "- 歩行の自立度: 主治医意見書: 自立／看護サマリー: 見守り。確認方法: 直近の状態を訪問看護に確認",
    );
    expect(notes).toContain(
      "## 処方・服薬\n- [2026-08-01] 降圧薬を朝1回内服（出典: 主治医意見書）",
    );
    expect(notes).toContain("## 心身機能・ADL\n- 歩行は見守りで可（出典: 看護サマリー）");
    expect(notes.indexOf("処方・服薬")).toBeLessThan(notes.indexOf("心身機能・ADL"));
  });

  it("composeIntakeNotes: 事実も食い違いも無ければサマリだけを返す", () => {
    const notes = composeIntakeNotes({
      summary: "要約のみ",
      cautions: [],
      facts: [],
      conflicts: [],
      documents: [],
    });
    expect(notes).toBe("## 資料の統合サマリ\n要約のみ");
  });
});
