import { describe, expect, it } from "vitest";
import {
  checkSheet,
  fieldKey,
  KAIPOKE_ASSESSMENT_FIELDS,
  safeLimit,
  sheetToText,
} from "./assessmentLayout";

describe("カイポケ アセスメント欄の一覧", () => {
  it("同じフォーム名は別ページにしか無い（page と組で一意）", () => {
    const keys = KAIPOKE_ASSESSMENT_FIELDS.map(fieldKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("安全上限は 行×字−行数、TX は最大文字数", () => {
    const p8 = KAIPOKE_ASSESSMENT_FIELDS.find((f) => f.formName === "form:emergencyContactSubject");
    expect(p8 && safeLimit(p8)).toBe(38); // 2行×20字−2（40字は登録エラーになった実例）
    const p9 = KAIPOKE_ASSESSMENT_FIELDS.find(
      (f) => f.formName === "form:nutritionHeedPointSubject",
    );
    expect(p9 && safeLimit(p9)).toBe(80);
  });

  it("checkSheet: 上限超えの欄を見つける", () => {
    const checks = checkSheet({
      fields: [
        {
          page: 8,
          formName: "form:emergencyContactSubject",
          text: "あ".repeat(39),
          isInferred: false,
          note: "",
        },
        { page: 10, formName: "form:summarySubject", text: "短い", isInferred: false, note: "" },
      ],
    });
    expect(checks[0].over).toBe(true);
    expect(checks[1].over).toBe(false);
  });

  it("sheetToText: ページ順・欄名つきで、空の欄と空のページは出さない", () => {
    const text = sheetToText({
      fields: [
        {
          page: 10,
          formName: "form:summarySubject",
          text: "全体像。",
          isInferred: false,
          note: "",
        },
        {
          page: 4,
          formName: "form:caseOrMedicalHistorySubject",
          text: "脳梗塞の既往。",
          isInferred: true,
          note: "",
        },
        {
          page: 1,
          formName: "form:consultationSubjectFamily",
          text: "",
          isInferred: false,
          note: "",
        },
      ],
    });
    expect(text.indexOf("■ 4枚目")).toBeLessThan(text.indexOf("■ 10枚目"));
    expect(text).toContain("【既往歴・現症】【推測を含む】\n脳梗塞の既往。");
    expect(text).not.toContain("1枚目");
  });
});
