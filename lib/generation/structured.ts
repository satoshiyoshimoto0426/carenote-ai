import { CLAUDE_MODEL, getAnthropic } from "@/lib/anthropic";

interface StructuredDraftRequest {
  /** 役割定義＋品質ルール。安定内容なのでプロンプトキャッシュに乗せる */
  systemPrompt: string;
  /** 帳票ごとの入力（面談メモ等）から組み立てたユーザーメッセージ */
  userMessage: string;
  /** 出力を保証する JSON Schema（全 object に additionalProperties:false 必須） */
  schema: Record<string, unknown>;
}

/**
 * 全帳票共通の「構造化下書き生成」コア。
 * Claude（adaptive thinking）＋構造化出力で、スキーマに適合するJSONを生成して返す。
 * 帳票ごとの違い（ルール・プロンプト・スキーマ・型）は呼び出し側が持つ。
 */
export async function generateStructuredDraft<T>(req: StructuredDraftRequest): Promise<T> {
  const client = getAnthropic();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: req.systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: req.userMessage }],
    output_config: { format: { type: "json_schema", schema: req.schema } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("安全上の理由で生成が拒否されました。入力内容をご確認ください。");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("生成結果が空でした。もう一度お試しください。");
  }

  try {
    // 構造化出力により JSON はスキーマに適合することが保証される
    return JSON.parse(textBlock.text) as T;
  } catch {
    throw new Error("生成結果の解析に失敗しました。もう一度お試しください。");
  }
}
