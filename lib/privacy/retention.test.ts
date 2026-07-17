import { describe, expect, it } from "vitest";
import { computeRetentionUntil, RETENTION_YEARS } from "./retention";

describe("保持期間: computeRetentionUntil", () => {
  it("既定は5年", () => {
    expect(RETENTION_YEARS).toBe(5);
  });

  it("起点 + 5年 を返す", () => {
    const from = new Date("2026-06-16T00:00:00.000Z");
    expect(computeRetentionUntil(from).toISOString().slice(0, 10)).toBe("2031-06-16");
  });

  it("起点を破壊しない", () => {
    const from = new Date("2026-06-16T00:00:00.000Z");
    computeRetentionUntil(from);
    expect(from.toISOString().slice(0, 10)).toBe("2026-06-16");
  });
});
