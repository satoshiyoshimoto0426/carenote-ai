import Anthropic from "@anthropic-ai/sdk";

/**
 * 既定の Claude モデル。最高品質の Opus 4.8。
 * コストを優先する場合は環境変数 `ANTHROPIC_MODEL`（例: `claude-sonnet-4-6`）で上書きできる。
 * ※ 構造化出力を使うため、対応モデル（Opus 4.8 / Sonnet 4.6 / Haiku 4.5）を指定すること。
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

let client: Anthropic | null = null;

/** 遅延初期化した Anthropic クライアントを返す。APIキー未設定なら明示的にエラーにする。 */
export function getAnthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません。");
  }
  if (!client) {
    client = new Anthropic({ apiKey });
  }
  return client;
}
