import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 実 Claude API を呼ぶ統合テスト（課金あり・手動実行専用）。
 * 実行: `npm run test:integration`
 * `.env.local` から ANTHROPIC_API_KEY を読み込む（キーの値はログに出さない）。
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
const SAMPLE_NOTES = `本人は半年前に自宅で転倒し大腿骨頸部骨折。人工骨頭置換術後、リハビリ病院を経て退院。
退院後は歩行が不安定（屋内は伝い歩き、屋外は夫が付き添い）。外出の機会が減り閉じこもりがち。
本人の発言:「また近所の友達とお茶会をしたい」「夫に迷惑をかけたくない。自分のことは自分でしたい」。
夫の発言:「入浴の介助が腰にこたえる。日中に少し休める時間がほしい」。長女は隣市在住で週末に来訪。
ADL: 食事は自立。トイレは日中自立・夜間はポータブルトイレ。入浴は夫が見守り・一部介助。
IADL: 調理・買い物は夫が担当。本人は簡単な片付けのみ。
医療: 高血圧で内服中。かかりつけ医から「転倒に注意しつつ、少しずつ活動量を増やすように」と助言。
意欲: デイサービスの利用に前向き。リハビリへの意欲あり。認知機能に明らかな低下なし。`;

describe("generateCarePlan 統合テスト（実API）", () => {
  it("サンプル面談メモから第1・2表の下書きを生成できる", async () => {
    // 動的importにより .env.local 読み込み後にモデル設定が評価される
    const { generateCarePlan } = await import("@/lib/generation/carePlan");

    const draft = await generateCarePlan({
      clientInfo: SAMPLE_CLIENT_INFO,
      assessmentNotes: SAMPLE_NOTES,
    });

    // 人間レビュー用に成果物を保存（架空事例のみ。vitestは成功時のconsoleを省略するため）
    const { saveDraftArtifact } = await import("./draftArtifacts");
    console.log("saved:", saveDraftArtifact("carePlan", draft));

    expect(draft.clientName).toBeTruthy();
    expect(draft.intentions).toBeTruthy();
    expect(draft.comprehensivePolicy).toBeTruthy();
    expect(draft.needs.length).toBeGreaterThanOrEqual(1);
    for (const n of draft.needs) {
      expect(n.need).toBeTruthy();
      expect(n.longTermGoal).toBeTruthy();
      expect(n.shortTermGoal).toBeTruthy();
      expect(Array.isArray(n.services)).toBe(true);
    }
    expect(Array.isArray(draft.itemsToConfirm)).toBe(true);
  });
});
