import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 実 Claude API を呼ぶ統合テスト（課金あり・手動実行専用）。
 * 実行: `npm run test:integration`（全itest実行）
 * 個別: `npm run test:integration -- scripts/assessmentMonitoringGeneration.itest.ts`
 */
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

// 架空の事例（実在の個人情報は含まない）
const SAMPLE_CLIENT_INFO = "82歳 女性 要介護2 夫(84歳)と二人暮らし";
const SAMPLE_NOTES = `半年前に大腿骨頸部骨折。退院後は歩行が不安定で外出を控え閉じこもりがち。
本人:「また友達とお茶会をしたい」「自分のことは自分でしたい」。夫:「入浴介助が腰にこたえる」。
食事は自立。トイレ日中自立・夜間ポータブル。入浴は夫が一部介助。調理・買い物は夫。
高血圧で内服中。デイサービス利用に前向き。認知機能に明らかな低下なし。`;

describe("generateAssessment 統合テスト（実API）", () => {
  it("サンプルメモからアセスメント下書きを生成できる", async () => {
    const { generateAssessment } = await import("@/lib/generation/assessment");

    const draft = await generateAssessment({
      clientInfo: SAMPLE_CLIENT_INFO,
      assessmentNotes: SAMPLE_NOTES,
    });

    const { saveDraftArtifact } = await import("./draftArtifacts");
    console.log("saved:", saveDraftArtifact("assessment", draft));

    expect(draft.clientName).toBeTruthy();
    expect(draft.overview).toBeTruthy();
    expect(draft.domains.length).toBeGreaterThanOrEqual(3);
    expect(draft.identifiedIssues.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(draft.strengths)).toBe(true);
    expect(Array.isArray(draft.itemsToConfirm)).toBe(true);
  });
});

describe("generateMonitoring 統合テスト（実API）", () => {
  it("前回プラン＋最新状況からモニタリング下書きを生成できる", async () => {
    const { generateMonitoring } = await import("@/lib/generation/monitoring");

    const draft = await generateMonitoring({
      clientInfo: SAMPLE_CLIENT_INFO,
      previousPlanSummary: `ニーズ1: また友達とお茶会に行きたい
  長期目標: 友人宅まで付き添いなしで外出できる（6か月）
  短期目標: 伝い歩きで屋内を安全に移動できる（3か月）
  サービス: 通所リハビリ（週2回）/ 夫による見守り
ニーズ2: 夫の介護負担を減らしたい
  長期目標: 入浴を概ね自分で行える（6か月）
  短期目標: デイサービスで週1回入浴する（3か月）
  サービス: 通所介護（週1回・入浴付き）`,
      monitoringNotes: `3か月時点の訪問。屋内の伝い歩きは安定し、日中のトイレは自立を維持。
デイサービスは週1回継続利用、入浴も実施できている。夫の腰痛は軽減傾向。
一方、夜間にトイレへ行く際にふらつきが1回あった。本人は「外までは、まだ少しこわい」と発言。
通所リハビリは週2回継続中で、リハビリ職からは「下肢筋力は改善傾向」と報告あり。`,
    });

    const { saveDraftArtifact } = await import("./draftArtifacts");
    console.log("saved:", saveDraftArtifact("monitoring", draft));

    expect(draft.clientName).toBeTruthy();
    expect(draft.overallSummary).toBeTruthy();
    expect(draft.goalEvaluations.length).toBeGreaterThanOrEqual(2);
    for (const g of draft.goalEvaluations) {
      expect(g.goal).toBeTruthy();
      expect(g.achievement).toBeTruthy();
      expect(g.evidence).toBeTruthy();
    }
    expect(draft.planRecommendation).toBeTruthy();
    expect(Array.isArray(draft.itemsToConfirm)).toBe(true);
  });
});
