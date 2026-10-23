import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 構造化下書きの共通の呼び出し（lib/generation/structured.ts）で、どのモデル・どの考える量で AI を呼ぶか。
 * 守ること: ①就労A型の計画書は、デモで待たせないため Sonnet 5.5・考える量 low で呼ぶ（2026-10-23 吉本さんの決定。
 *   今までの Opus 4.8 では約45秒、Sonnet 5.5 low では約15秒 ── 架空の面談で測定）
 *   ②CareNote の書類（モデルを指定しない呼び出し）は、今までどおり CLAUDE_MODEL・考える量の指定なし（品質を変えない）。
 * AI の会社には送らない（呼び出しを代役にして、渡した値だけを見る）。
 */
const create = vi.hoisted(() => vi.fn());
vi.mock("@/lib/anthropic", () => ({
  CLAUDE_MODEL: "claude-opus-4-8",
  getAnthropic: () => ({ messages: { create } }),
}));

const { emptyDraft } = await import("@/lib/supportPlan/testFixtures");
const { generateStructuredDraft } = await import("./structured");
const { generateSupportPlanA, SUPPORT_PLAN_A_MODEL, SUPPORT_PLAN_A_EFFORT } = await import(
  "./supportPlanA"
);

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text: JSON.stringify(emptyDraft()) }],
  });
});

describe("構造化下書きの呼び出し", () => {
  it("就労A型の計画書は Sonnet 5.5・考える量 low で呼び、JSON の決まり（構造化出力）は付けたまま", async () => {
    await generateSupportPlanA({ interviewNotes: "架空の面談のメモ。" });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-sonnet-5-5");
    expect(SUPPORT_PLAN_A_MODEL).toBe("claude-sonnet-5-5");
    expect(params.output_config.effort).toBe("low");
    expect(SUPPORT_PLAN_A_EFFORT).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("モデルを指定しない呼び出し（CareNote の書類）は、今までどおり CLAUDE_MODEL・考える量の指定なし", async () => {
    await generateStructuredDraft({
      systemPrompt: "s",
      userMessage: "u",
      schema: { type: "object" },
    });
    const params = create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-4-8");
    expect(params.output_config).not.toHaveProperty("effort");
    expect(params.output_config.format.type).toBe("json_schema");
  });

  it("AI が断ったときは、日本語の理由で止める（今までどおり）", async () => {
    create.mockResolvedValue({ stop_reason: "refusal", content: [] });
    await expect(generateSupportPlanA({ interviewNotes: "架空の面談のメモ。" })).rejects.toThrow(
      "拒否",
    );
  });
});
