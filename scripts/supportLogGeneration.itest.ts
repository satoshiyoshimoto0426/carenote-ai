import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 実 Claude API を呼ぶ統合テスト（課金あり・手動実行専用）。
 * 実行: `npm run test:integration -- scripts/supportLogGeneration.itest.ts`
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

// 架空の対応メモ（実在の個人情報は含まない・複数日の殴り書きを想定）
const SAMPLE_SUPPORT_NOTES = `6/9 10時ごろ 長女から事務所に電話。「母が夜眠れてないみたい。昼間ずっとうとうとしてる」と。
そのままデイに電話、相談員の田中さんに確認→デイでも午後の活動中に居眠り増えてる、レク参加も減ってるとのこと。
先月内科で薬が変わったかも？と長女。お薬手帳はまだ見れてない。

6/11 14時 定期モニタリングで自宅訪問。本人は表情ふつう、会話はスムーズ。
本人「夜は2回くらい目が覚めるけど、昼寝してるから大丈夫」
食事は3食とれてる(長女作り置き)。トイレ自立変わらず。デイは休まず行けてる。
お薬手帳確認→先月から眠剤が1種類追加されてた。
→眠剤追加と日中の傾眠、時期が重なってるので主治医に情報提供したほうがよさそう。長女に受診時に相談するよう勧めた。次回訪問でその後を確認する。`;

describe("generateSupportLog 統合テスト（実API）", () => {
  it("複数日の殴り書きメモから支援経過記録を生成できる", async () => {
    const { generateSupportLog } = await import("@/lib/generation/supportLog");

    const draft = await generateSupportLog({
      clientInfo: "86歳 女性 要介護1 長女と同居",
      supportNotes: SAMPLE_SUPPORT_NOTES,
    });

    const { saveDraftArtifact } = await import("./draftArtifacts");
    console.log("saved:", saveDraftArtifact("supportLog", draft));

    expect(draft.clientName).toBeTruthy();
    // 別の日（6/9 と 6/11）は別エントリに分割される
    expect(draft.entries.length).toBeGreaterThanOrEqual(2);
    for (const e of draft.entries) {
      expect(e.date).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.action).toBeTruthy();
      expect(e.background).toBeTruthy();
      expect(e.factsAndStatements).toBeTruthy();
      expect(e.judgement).toBeTruthy();
      expect(e.nextAction).toBeTruthy();
    }
    expect(Array.isArray(draft.itemsToConfirm)).toBe(true);
  });
});
