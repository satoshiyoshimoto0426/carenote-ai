import { CLAUDE_MODEL, getAnthropic } from "@/lib/anthropic";
import { composePersonaNotes, type RescuePersona } from "./rescue";

/**
 * 救済モード Stage0「提供書類の統合読解」。
 *
 * なぜ存在するか:
 *   ケアマネが手元に持つPDF資料（診療情報提供書・基本情報・過去のケアプラン等）を、
 *   手打ち人物像と突き合わせて1回のAI読解でサマリ化し、書類一式生成（rescue.ts）の
 *   入力に統合するため（SPEC §6.5 F9 の拡張）。
 *
 * 何と繋がるか:
 *   - 呼び出し元: app/api/rescue/route.ts（sourceDocs があるときだけ Stage0 として実行）
 *   - 出力の使い先: rescue.composeRescueNotes が personaNotes の先頭に連結する
 *   - PDFの受け渡し流儀: app/api/evaluate/route.ts と同じ「Blob取得→base64→documentブロック→処理後 del()」
 */

/** 統合読解に渡すPDF1件（Blobから取得済みのbase64）。 */
export interface IntakeDocument {
  /** 書類名（出典表記に使う。例: 診療情報提供書.pdf） */
  name: string;
  /** PDF本体のbase64 */
  base64: string;
}

/** 統合読解の結果。API契約の intake フィールドにそのまま載る。 */
export interface IntakeResult {
  /** 出典（書類名）付きの統合サマリ。人物像メモの先頭に連結される */
  summary: string;
  /** 要注意点（手打ちとの矛盾・重要リスク等）。UIで警告表示する想定 */
  cautions: string[];
}

/** 統合読解の出力を保証する JSON Schema（構造化出力用・additionalProperties:false 必須）。 */
const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cautions"],
  properties: {
    summary: {
      type: "string",
      description:
        "提供書類から抽出した事実の統合サマリ。各事実に出典（書類名）を付ける。氏名等の固有名詞は書き写さない。",
    },
    cautions: {
      type: "array",
      items: { type: "string" },
      description: "要注意点。手打ち情報との矛盾・読み取れなかった箇所・重要なリスクを列挙する。",
    },
  },
} as const;

/** 統合読解のシステムプロンプト（安定内容・プロンプトキャッシュ対象）。 */
export const INTAKE_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
添付されたPDF資料（診療情報提供書・基本情報・過去の計画書など）を読み取り、
ケアプラン等の書類一式を下書きするための「統合サマリ」を作成します。

以下のルールを厳守してください。

1. **事実のみを抽出**し、各事実の末尾に出典を「（出典: 書類名）」の形で必ず付けてください。
   資料に書かれていないことを推測で補わないでください。
2. **氏名・住所・電話番号などの固有名詞をサマリに書き写さないでください。**
   人物は「本人」「長女」「主治医」等の続柄・役割の一般表現に置き換えてください
   （仮名化の穴を広げないため。医療機関名・事業所名も「かかりつけ医」等の一般表現にする）。
3. あわせて渡される「手打ち入力（ケアマネ入力）」と資料の内容に**矛盾**がある場合は、
   矛盾の内容を cautions に具体的に列挙してください（どの書類とどう食い違うか）。
4. 読み取れない箇所・判読不能なページがあれば、その旨も cautions に含めてください。
5. サマリはアセスメントの観点（健康状態・心身機能・生活歴・家族・サービス利用・意向）で
   整理し、日付のある出来事は時系列がわかるように書いてください。

出力は指定されたJSON構造のみで返してください。`;

/**
 * 統合読解のユーザーメッセージを組み立てる純粋関数（テスト対象）。
 * documentブロックの直後に置くテキストで、書類名の一覧と手打ち人物像を提示する。
 */
export function buildIntakePrompt(docs: { name: string }[], personaNotes: string): string {
  const parts: string[] = [];

  parts.push(
    `## 添付した提供書類（${docs.length}件）\n${docs.map((d, i) => `${i + 1}. ${d.name}`).join("\n")}`,
  );

  const notes = personaNotes.trim();
  if (notes) {
    parts.push(`## 手打ち入力（ケアマネ入力・こちらを優先）\n${notes}`);
  } else {
    parts.push("## 手打ち入力（ケアマネ入力）\n（今回は手打ち入力なし。資料のみから読み取る）");
  }

  parts.push(
    "上記の提供書類を読み取り、ルールに従って統合サマリ（出典＝書類名付き）と要注意点をJSON構造で作成してください。氏名などの固有名詞は書き写さず、「本人」「長女」等の一般表現に置き換えてください。",
  );

  return parts.join("\n\n");
}

/**
 * PDF資料＋手打ち人物像を1回のClaude呼び出しで統合読解し、出典付きサマリと要注意点を返す。
 * PDFは documentブロック（base64）で渡す（evaluate と同じ流儀）。Blobの削除は呼び出し元の責務。
 */
export async function generateIntake(
  docs: IntakeDocument[],
  persona: RescuePersona,
): Promise<IntakeResult> {
  const client = getAnthropic();
  const personaNotes = composePersonaNotes(persona);

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: INTAKE_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          ...docs.map((doc) => ({
            type: "document" as const,
            source: {
              type: "base64" as const,
              media_type: "application/pdf" as const,
              data: doc.base64,
            },
            title: doc.name,
          })),
          { type: "text" as const, text: buildIntakePrompt(docs, personaNotes) },
        ],
      },
    ],
    output_config: { format: { type: "json_schema", schema: INTAKE_SCHEMA } },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("安全上の理由で資料の読み取りが拒否されました。資料の内容をご確認ください。");
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("資料の読み取り結果が空でした。もう一度お試しください。");
  }

  try {
    // 構造化出力により JSON はスキーマに適合することが保証される
    return JSON.parse(textBlock.text) as IntakeResult;
  } catch {
    throw new Error("資料の読み取り結果の解析に失敗しました。もう一度お試しください。");
  }
}
