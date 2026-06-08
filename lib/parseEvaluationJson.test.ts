import { describe, expect, it } from "vitest";
import { parseEvaluationJson } from "./parseEvaluationJson";

const valid = {
  client_name: "山田太郎",
  evaluator_comment: "概ね良好です。",
  total_score: 20,
  categories: [
    {
      id: 1,
      name: "重要事項説明書・契約書",
      max_score: 3,
      score: 2,
      good_points: ["記入漏れが少ない"],
      issues: ["同意書の日付欠落"],
      advice: "日付を確認すること",
    },
  ],
  priority_improvements: ["改善1", "改善2", "改善3"],
};

describe("parseEvaluationJson", () => {
  it("素のJSONオブジェクトを解析する", () => {
    const r = parseEvaluationJson(JSON.stringify(valid));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.total_score).toBe(20);
  });

  it("```json フェンス内のJSONを解析する", () => {
    const r = parseEvaluationJson(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``);
    expect(r.ok).toBe(true);
  });

  it("前後に地の文があっても解析する", () => {
    const r = parseEvaluationJson(`評価しました。\n${JSON.stringify(valid)}\n以上です。`);
    expect(r.ok).toBe(true);
  });

  it("total_score が 0 でも有効", () => {
    const r = parseEvaluationJson(JSON.stringify({ ...valid, total_score: 0 }));
    expect(r.ok).toBe(true);
  });

  it("JSONオブジェクトが無ければ no_json", () => {
    expect(parseEvaluationJson("ここにはJSONがありません")).toEqual({
      ok: false,
      reason: "no_json",
    });
  });

  it("壊れたJSONは invalid_json", () => {
    const r = parseEvaluationJson("{ 壊れた,,, }");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid_json");
  });

  it("必須フィールド欠落は invalid_shape", () => {
    expect(parseEvaluationJson(JSON.stringify({ foo: "bar" }))).toEqual({
      ok: false,
      reason: "invalid_shape",
    });
  });
});
