import { describe, expect, it } from "vitest";
import { GenerateRequestError, generateFromBody } from "./dispatch";

// 実生成（API呼び出し）に到達する前に throw する経路のみを検証する。
describe("generateFromBody: 入力サイズ上限（G3/R7 High#1）", () => {
  it("1フィールドが4万字超なら 413", async () => {
    const body = { documentType: "assessment", assessmentNotes: "あ".repeat(40_001) };
    await expect(generateFromBody(body)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("合計が6万字超なら 413（各フィールドは上限内でも）", async () => {
    const body = {
      documentType: "monitoring",
      previousPlanSummary: "あ".repeat(35_000),
      monitoringNotes: "い".repeat(30_000),
    };
    await expect(generateFromBody(body)).rejects.toMatchObject({ status: 413 });
  });

  it("413 は GenerateRequestError", async () => {
    const body = { assessmentNotes: "x".repeat(60_001) };
    await expect(generateFromBody(body)).rejects.toBeInstanceOf(GenerateRequestError);
  });
});

describe("generateFromBody: 必須チェック（上限内）は従来どおり 400", () => {
  it("carePlan でメモ空なら 400", async () => {
    await expect(generateFromBody({ documentType: "carePlan" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("不明な documentType は 400", async () => {
    await expect(
      generateFromBody({ documentType: "unknown", assessmentNotes: "テスト" }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
