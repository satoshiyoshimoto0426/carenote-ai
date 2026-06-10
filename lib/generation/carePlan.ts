import { CLAUDE_MODEL, getAnthropic } from "@/lib/anthropic";
import type { CarePlanDraft, CarePlanInput } from "@/types/carePlan";
import { buildCarePlanUserMessage, CARE_PLAN_SYSTEM_PROMPT } from "./carePlanPrompt";

/** 構造化出力(JSON Schema)。CarePlanDraft と一致させること。全 object に additionalProperties:false が必要。 */
const CARE_PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    intentions: { type: "string" },
    comprehensivePolicy: { type: "string" },
    needs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          need: { type: "string" },
          longTermGoal: { type: "string" },
          longTermPeriod: { type: "string" },
          shortTermGoal: { type: "string" },
          shortTermPeriod: { type: "string" },
          services: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                serviceType: { type: "string" },
                frequency: { type: "string" },
                period: { type: "string" },
              },
              required: ["content", "serviceType", "frequency", "period"],
              additionalProperties: false,
            },
          },
        },
        required: [
          "need",
          "longTermGoal",
          "longTermPeriod",
          "shortTermGoal",
          "shortTermPeriod",
          "services",
        ],
        additionalProperties: false,
      },
    },
    itemsToConfirm: { type: "array", items: { type: "string" } },
  },
  required: ["clientName", "intentions", "comprehensivePolicy", "needs", "itemsToConfirm"],
  additionalProperties: false,
};

/**
 * アセスメントメモ等の入力から、ルールに従ったケアプラン下書き(第1・2表)を生成する。
 * 品質ルールはシステムプロンプトに注入し、プロンプトキャッシュで再利用する。
 * 出力は構造化出力(JSON Schema)で型を保証する。
 */
export async function generateCarePlan(input: CarePlanInput): Promise<CarePlanDraft> {
  const client = getAnthropic();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: CARE_PLAN_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildCarePlanUserMessage(input) }],
    output_config: { format: { type: "json_schema", schema: CARE_PLAN_JSON_SCHEMA } },
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
    return JSON.parse(textBlock.text) as CarePlanDraft;
  } catch {
    throw new Error("生成結果の解析に失敗しました。もう一度お試しください。");
  }
}
