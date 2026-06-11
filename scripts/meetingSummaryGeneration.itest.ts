import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 実 Claude API を呼ぶ統合テスト（課金あり・手動実行専用）。
 * 実行: `npm run test:integration -- scripts/meetingSummaryGeneration.itest.ts`
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

// 架空の会議メモ（実在の個人情報は含まない・殴り書きを想定）
const SAMPLE_MEETING_NOTES = `6/10 14時 利用者宅で担会。45分くらい。
出席: 自分(ケアマネ)、デイの相談員 佐藤さん、通所リハのPT(名前聞きそびれた)、本人、夫
議題1 屋内移動の短期目標
 PT「下肢筋力は改善傾向。屋内伝い歩きは安定してきた」
 夫「夜トイレのとき1回ふらついた」→夜間の足元灯と手すりの話
議題2 入浴
 デイ佐藤さん 入浴は週1で問題なく実施中。本人も「気持ちいい」と
 夫の腰痛は少し楽になってきたとのこと
決まったこと: 通所リハ週2継続。デイ週1継続。福祉用具で夜間動線(足元灯・手すり)を検討→福祉用具事業所に見積依頼は自分がやる
次回: 3か月後めど。屋外歩行の練習をどう入れるかは次回までにPTと相談`;

describe("generateMeetingSummary 統合テスト（実API）", () => {
  it("会議メモから第4表の下書きを生成できる", async () => {
    const { generateMeetingSummary } = await import("@/lib/generation/meetingSummary");

    const draft = await generateMeetingSummary({
      clientInfo: "82歳 女性 要介護2",
      meetingNotes: SAMPLE_MEETING_NOTES,
    });

    const { saveDraftArtifact } = await import("./draftArtifacts");
    console.log("saved:", saveDraftArtifact("meetingSummary", draft));

    expect(draft.clientName).toBeTruthy();
    expect(draft.meetingDate).toBeTruthy();
    expect(draft.attendees.length).toBeGreaterThanOrEqual(4);
    expect(draft.discussions.length).toBeGreaterThanOrEqual(2);
    for (const d of draft.discussions) {
      expect(d.item).toBeTruthy();
      expect(d.details).toBeTruthy();
    }
    expect(draft.conclusion).toBeTruthy();
    expect(draft.remainingIssues).toBeTruthy();
    expect(Array.isArray(draft.itemsToConfirm)).toBe(true);
  });
});
