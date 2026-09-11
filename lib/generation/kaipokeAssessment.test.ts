import { describe, expect, it } from "vitest";
import type { AssessmentDraft } from "@/types/assessment";
import {
  buildFieldGuide,
  buildKaipokeAssessmentMessage,
  KAIPOKE_ASSESSMENT_SYSTEM_PROMPT,
  toSheet,
} from "./kaipokeAssessment";

const draft: AssessmentDraft = {
  clientName: "A様",
  assessmentReason: "退院",
  mainComplaints: "本人「家で暮らしたい」",
  lifeHistory: "長く農業。",
  currentServices: "訪問看護 週2",
  overview: "全体像",
  domains: [],
  strengths: [],
  identifiedIssues: [],
  itemsToConfirm: [],
};

describe("カイポケ転記用シートの生成（純粋部分）", () => {
  it("欄一覧にページ・ラベル・安全上限・ヒントが入る", () => {
    const guide = buildFieldGuide();
    expect(guide).toContain("### 1枚目：フェイスシート");
    expect(guide).toContain(
      "key=p8:form:emergencyContactSubject ｜ 緊急連絡・見守りの方法 ｜ 最大2行×全角20字 ｜ 安全上限38字",
    );
    expect(guide).toContain(
      "key=p9:form:nutritionHeedPointSubject ｜ 栄養留意点 ｜ 最大80字 ｜ 安全上限80字",
    );
  });

  it("システムプロンプトに事実のみ・推測フラグ・個人情報禁止・禁止文字の指示がある", () => {
    expect(KAIPOKE_ASSESSMENT_SYSTEM_PROMPT).toContain("isInferred を true");
    expect(KAIPOKE_ASSESSMENT_SYSTEM_PROMPT).toContain(
      "氏名・住所・電話番号・医療機関名・事業所名は書かない",
    );
    expect(KAIPOKE_ASSESSMENT_SYSTEM_PROMPT).toContain("「〜」は「から」または「～」");
  });

  it("ユーザーメッセージに下書きJSONと補足メモが入る", () => {
    const msg = buildKaipokeAssessmentMessage(draft, "資料: 降圧薬を内服");
    expect(msg).toContain('"mainComplaints": "本人「家で暮らしたい」"');
    expect(msg).toContain("## 補足メモ");
    expect(buildKaipokeAssessmentMessage(draft)).not.toContain("## 補足メモ");
  });

  it("toSheet: key を page/formName に分け、前後の空白を落とす。壊れた key は捨てる", () => {
    const sheet = toSheet({
      fields: [
        {
          key: "p4:form:caseOrMedicalHistorySubject",
          text: " 脳梗塞の既往。 ",
          isInferred: false,
          note: "",
        },
        { key: "broken", text: "x", isInferred: false, note: "" },
      ],
    });
    expect(sheet.fields).toEqual([
      {
        page: 4,
        formName: "form:caseOrMedicalHistorySubject",
        text: "脳梗塞の既往。",
        isInferred: false,
        note: "",
      },
    ]);
  });
});
