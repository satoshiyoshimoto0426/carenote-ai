import { describe, expect, it } from "vitest";
// UMD ラッパ経由で純粋ロジックのみ読み込む（DOM依存関数は呼ばない）。
import adapter from "./kaipoke.js";

describe("CareNoteKaipoke 文字幅・行数計測", () => {
  it("charWidth: 半角=0.5 / 全角=1", () => {
    expect(adapter.charWidth("a")).toBe(0.5);
    expect(adapter.charWidth("1")).toBe(0.5);
    expect(adapter.charWidth("ｶ")).toBe(0.5); // 半角カナ
    expect(adapter.charWidth("あ")).toBe(1);
    expect(adapter.charWidth("漢")).toBe(1);
    expect(adapter.charWidth("　")).toBe(1); // 全角スペース
  });

  it("lineFullWidth: 全角換算で切り上げ", () => {
    expect(adapter.lineFullWidth("あいう")).toBe(3);
    expect(adapter.lineFullWidth("abcd")).toBe(2); // 0.5*4
    expect(adapter.lineFullWidth("あa")).toBe(2); // 1 + 0.5 -> ceil(1.5)=2
  });

  it("measureText: 行数・桁数の超過を警告する（止めはしない）", () => {
    const mapping = {
      key: "overview",
      label: "まとめ",
      names: [],
      maxRows: 2,
      maxColsFullWidth: 5,
    };
    const ok = adapter.measureText("あいうえ\nかきくけ", mapping);
    expect(ok.rows).toBe(2);
    expect(ok.overRows).toBe(false);
    expect(ok.overCols).toBe(false);
    expect(ok.warnings).toHaveLength(0);

    const over = adapter.measureText("あいうえおか\n2行目\n3行目", mapping);
    expect(over.rows).toBe(3);
    expect(over.overRows).toBe(true); // 3 > 2
    expect(over.overCols).toBe(true); // 6 > 5
    expect(over.warnings.length).toBe(2);
  });
});

describe("CareNoteKaipoke 流し込み対象の選定", () => {
  it("INJECTABLE_TYPES は assessment と carePlan", () => {
    expect(adapter.INJECTABLE_TYPES).toContain("assessment");
    expect(adapter.INJECTABLE_TYPES).toContain("carePlan");
  });

  it("assessment: 値のある欄のみ・主訴は caution フラグ", () => {
    const draft = {
      clientName: "要確認",
      mainComplaints: "本人: 家で過ごしたい。",
      lifeHistory: "",
      overview: "全体として在宅継続が可能。",
    };
    const fields = adapter.selectInjectableFields("assessment", draft);
    const keys = fields.map((f: { key: string }) => f.key);
    expect(keys).toContain("mainComplaints");
    expect(keys).toContain("overview");
    expect(keys).not.toContain("lifeHistory"); // 空欄は除外

    const main = fields.find((f: { key: string }) => f.key === "mainComplaints");
    expect(main.mapping.confidence).toBe("caution");
    expect(main.mapping.names).toContain("form:consultationSubjectPersonHimself");
  });

  it("carePlan: assessmentSummary → userLifeSubject / 総合方針はラベル探索", () => {
    const draft = {
      clientName: "要確認",
      assessmentSummary: "課題分析の結果...",
      comprehensivePolicy: "総合的な援助方針...",
    };
    const fields = adapter.selectInjectableFields("carePlan", draft);
    const summary = fields.find((f: { key: string }) => f.key === "assessmentSummary");
    expect(summary.mapping.names).toContain("form:userLifeSubject");
    const policy = fields.find((f: { key: string }) => f.key === "comprehensivePolicy");
    expect(policy.mapping.labelText).toBe("総合的な援助の方針");
  });

  it("未対応の documentType は空配列", () => {
    expect(adapter.selectInjectableFields("monitoring", { overallSummary: "x" })).toHaveLength(0);
  });
});
