import { describe, expect, it } from "vitest";
import { composePersonaNotes } from "./rescue";
import { buildIntakePrompt, INTAKE_SYSTEM_PROMPT } from "./rescueIntake";

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
      "氏名・住所・電話番号などの固有名詞をサマリに書き写さないでください",
    );
    expect(INTAKE_SYSTEM_PROMPT).toContain("（出典: 書類名）");
    expect(INTAKE_SYSTEM_PROMPT).toContain("矛盾");
    expect(INTAKE_SYSTEM_PROMPT).toContain("cautions");
  });
});
