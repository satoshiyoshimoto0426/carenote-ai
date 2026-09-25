import { describe, expect, it } from "vitest";
import { aiTimeoutMs, EVALUATE_AI_BUDGET_MS } from "./timeBudget";

/** 点検で AI を待てる残りの時間（2026-09-25 独立審査: 削除などで使った時間を差し引く） */
describe("aiTimeoutMs", () => {
  it("すぐ AI を呼べたときは、上限いっぱい待つ", () => {
    expect(aiTimeoutMs(0, 0)).toBe(EVALUATE_AI_BUDGET_MS);
  });

  it("読み込みと削除で使った時間を差し引く（削除が上限の8秒を使ったとき）", () => {
    expect(aiTimeoutMs(1_000, 9_000)).toBe(EVALUATE_AI_BUDGET_MS - 8_000);
  });

  it("持ち時間を使い切っていても、1秒は待つ（負の値や 0 で即座に打ち切らない）", () => {
    expect(aiTimeoutMs(0, 200_000)).toBe(1_000);
  });

  it("上限は処理の持ち時間（120秒）より短い", () => {
    expect(EVALUATE_AI_BUDGET_MS).toBeLessThan(120_000);
  });
});
