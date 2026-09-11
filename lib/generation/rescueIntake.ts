import { CLAUDE_MODEL, getAnthropic } from "@/lib/anthropic";
import {
  INTAKE_CATEGORIES,
  INTAKE_DOC_TYPES,
  type IntakeDocType,
  type IntakeMediaType,
  type IntakeResult,
} from "./intakeTypes";
import { composePersonaNotes, type RescuePersona } from "./rescue";

// 型と定数の正本は intakeTypes.ts（ブラウザでも読める）。ここからも再輸出して既存の import を壊さない
export * from "./intakeTypes";

/**
 * 救済モード Stage0「提供書類の統合読解」（第6段・OCR統合で深化 2026-09-11）。
 *
 * なぜ存在するか:
 *   ケアマネが手元に持つ資料（診療情報提供書・主治医意見書・看護サマリー・認定調査票など。PDF または
 *   スマホで撮った画像）を、手打ち人物像と突き合わせて1回のAI読解で「出典付きの事実」に構造化し、
 *   書類一式生成（rescue.ts）の入力に統合するため（SPEC §6.5 F9 の拡張）。
 *   画像の文字読み取り（OCR）も同じAI呼び出しで行う（別のOCRサービスを増やさない）。
 *
 * 何と繋がるか:
 *   - 呼び出し元: app/api/rescue/route.ts（sourceDocs があるときだけ Stage0 として実行）
 *   - 出力の使い先: composeIntakeNotes（本ファイル）で分類別テキストにし、rescue.composeRescueNotes が先頭に連結
 *   - 受け渡し流儀: 「Blob取得→base64→document/imageブロック→処理後 del()」（非保持）
 *
 * 個人情報:
 *   資料は原本のまま Anthropic へ渡る（DATA-HANDLING §3 の明示した例外）。出力側は固有名詞を書き写さない指示に
 *   加え、呼び出し元が maskPii を通す（二重）。
 */

/** 統合読解に渡す資料1件（Blobから取得済みのbase64）。 */
export interface IntakeDocument {
  /** 書類名（出典表記に使う。例: 診療情報提供書.pdf） */
  name: string;
  /** 本体のbase64 */
  base64: string;
  /** PDF か画像か */
  mediaType: IntakeMediaType;
  /** 職員が指定した種別（未指定なら「その他」） */
  docType: IntakeDocType;
}

/** 統合読解の出力を保証する JSON Schema（構造化出力用・additionalProperties:false 必須）。 */
const INTAKE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "cautions", "facts", "conflicts", "documents"],
  properties: {
    summary: {
      type: "string",
      description:
        "提供書類から抽出した事実の短い統合サマリ。各事実に出典（書類名）を付ける。氏名等の固有名詞は書き写さない。",
    },
    cautions: {
      type: "array",
      items: { type: "string" },
      description: "要注意点。手打ち情報との矛盾・読み取れなかった箇所・重要なリスクを列挙する。",
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "text", "source", "date"],
        properties: {
          category: { type: "string", enum: INTAKE_CATEGORIES },
          text: { type: "string" },
          source: { type: "string" },
          date: { type: "string" },
        },
      },
    },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "statements", "advice"],
        properties: {
          topic: { type: "string" },
          statements: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source", "text"],
              properties: { source: { type: "string" }, text: { type: "string" } },
            },
          },
          advice: { type: "string" },
        },
      },
    },
    documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "detectedType", "readability"],
        properties: {
          name: { type: "string" },
          detectedType: { type: "string", enum: INTAKE_DOC_TYPES },
          readability: { type: "string", enum: ["良好", "一部判読不能", "判読不能"] },
        },
      },
    },
  },
} as const;

/** 資料種別ごとの「どこを読むか」のヒント（プロンプトに埋め込む） */
const DOC_TYPE_HINTS: Record<IntakeDocType, string> = {
  診療情報提供書: "傷病名・紹介目的・既往歴・現病歴・処方内容・検査所見・今後の方針・注意事項",
  主治医意見書:
    "傷病名と経過・心身の状態（麻痺・褥瘡・拘縮等）・認知症の中核症状と周辺症状・医学的管理の必要性・サービス提供時の医学的観点からの留意事項・特記すべき事項",
  看護サマリー:
    "看護問題・実施した処置・内服管理の方法・ADL（移動・食事・排泄・清潔）・皮膚の状態・家族状況・退院時の指導内容・継続してほしいケア",
  認定調査票: "基本調査の各項目（麻痺・拘縮・移乗・移動・食事・排泄・認知・行動）と特記事項",
  基本情報: "世帯構成・住環境・利用中のサービス・緊急連絡の続柄・生活歴の概要",
  その他: "書かれている事実のうち、健康・心身機能・生活・家族・サービス・意向に関わるもの",
};

/** 統合読解のシステムプロンプト（安定内容・プロンプトキャッシュ対象）。 */
export const INTAKE_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
添付された資料（診療情報提供書・主治医意見書・看護サマリー・認定調査票・基本情報など。PDF または紙を撮影した画像）を読み取り、
ケアプラン等の書類一式を下書きするための「出典付きの事実」と「統合サマリ」を作成します。
画像の場合は、写っている文字を丁寧に読み取ってください（手書き・かすれ・傾きがあっても読める範囲で読み、読めない箇所は推測しない）。

以下のルールを厳守してください。

1. **事実のみを抽出**し、facts の各項目に出典（書類名。可能なら欄名やページ）を source に入れてください。
   資料に書かれていないことを推測で補わないでください。summary にも各事実の末尾に「（出典: 書類名）」を付けてください。
2. **氏名・住所・電話番号・保険番号などの固有名詞を書き写さないでください。**
   人物は「本人」「長女」「主治医」等の続柄・役割の一般表現に置き換えてください
   （仮名化の穴を広げないため。医療機関名・事業所名も「かかりつけ医」「訪問看護事業所」等の一般表現にする）。
3. facts の category は指定の分類から選び、アセスメントの欄に写しやすいよう1項目1事実で書いてください。日付があれば date に入れてください。
4. **資料どうしの食い違い**（処方の相違、ADL評価の相違、診断名の相違、日付の新旧など）は conflicts に、
   どの資料が何と言っているかを statements に並べ、確かめ方を advice に書いてください。
   あわせて渡される「手打ち入力（ケアマネ入力）」との矛盾は cautions に書いてください。
5. 読み取れない箇所・判読不能なページがあれば cautions に含め、documents の readability に反映してください。
   職員が指定した資料種別と内容が食い違う場合（例:「主治医意見書」とされたが看護サマリーだった）は detectedType に実際の種別を入れ、cautions にも書いてください。
6. summary はアセスメントの観点（健康状態・心身機能・生活歴・家族・サービス利用・意向）で整理し、日付のある出来事は時系列がわかるように書いてください。

出力は指定されたJSON構造のみで返してください。`;

/**
 * 統合読解のユーザーメッセージを組み立てる純粋関数（テスト対象）。
 * documentブロックの直後に置くテキストで、書類名・種別・読みどころの一覧と手打ち人物像を提示する。
 */
export function buildIntakePrompt(
  docs: { name: string; docType?: IntakeDocType; mediaType?: IntakeMediaType }[],
  personaNotes: string,
): string {
  const parts: string[] = [];

  const lines = docs.map((d, i) => {
    const t = d.docType ?? "その他";
    const kind = d.mediaType?.startsWith("image/") ? "画像" : "PDF";
    return `${i + 1}. ${d.name}（種別: ${t}／${kind}）── 読みどころ: ${DOC_TYPE_HINTS[t]}`;
  });
  parts.push(`## 添付した提供書類（${docs.length}件）\n${lines.join("\n")}`);

  const notes = personaNotes.trim();
  if (notes) {
    parts.push(`## 手打ち入力（ケアマネ入力・こちらを優先）\n${notes}`);
  } else {
    parts.push("## 手打ち入力（ケアマネ入力）\n（今回は手打ち入力なし。資料のみから読み取る）");
  }

  parts.push(
    "上記の提供書類を読み取り、ルールに従って出典付きの事実（facts）・資料間の食い違い（conflicts）・資料ごとの読み取り報告（documents）・統合サマリ（出典＝書類名付き）・要注意点をJSON構造で作成してください。氏名などの固有名詞は書き写さず、「本人」「長女」等の一般表現に置き換えてください。",
  );

  return parts.join("\n\n");
}

/**
 * 読み取り結果を、下流の帳票生成に渡す「分類別の事実メモ」にする純粋関数（テスト対象）。
 * summary だけより、欄ごとに写しやすい。食い違いは冒頭に出して人の判断を促す。
 */
export function composeIntakeNotes(intake: IntakeResult): string {
  const parts: string[] = [];
  if (intake.conflicts.length > 0) {
    const lines = intake.conflicts.map((c) => {
      const st = c.statements.map((s) => `${s.source}: ${s.text}`).join("／");
      return `- ${c.topic}: ${st}。確認方法: ${c.advice}`;
    });
    parts.push(`## 資料間の食い違い（要確認・断定しない）\n${lines.join("\n")}`);
  }
  for (const cat of INTAKE_CATEGORIES) {
    const facts = intake.facts.filter((f) => f.category === cat);
    if (facts.length === 0) continue;
    const lines = facts.map(
      (f) => `- ${f.date ? `[${f.date}] ` : ""}${f.text}（出典: ${f.source}）`,
    );
    parts.push(`## ${cat}\n${lines.join("\n")}`);
  }
  if (parts.length === 0 && intake.summary.trim()) {
    parts.push(`## 資料の統合サマリ\n${intake.summary.trim()}`);
  }
  return parts.join("\n\n");
}

/**
 * 資料＋手打ち人物像を1回のClaude呼び出しで統合読解し、出典付きの事実・食い違い・サマリを返す。
 * PDFは documentブロック、画像は imageブロック（base64）で渡す。Blobの削除は呼び出し元の責務。
 */
export async function generateIntake(
  docs: IntakeDocument[],
  persona: RescuePersona,
): Promise<IntakeResult> {
  const client = getAnthropic();
  const personaNotes = composePersonaNotes(persona);

  const blocks = docs.map((doc) =>
    doc.mediaType === "application/pdf"
      ? {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: doc.base64,
          },
          title: doc.name,
        }
      : {
          type: "image" as const,
          source: { type: "base64" as const, media_type: doc.mediaType, data: doc.base64 },
        },
  );

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 12000,
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
          ...blocks,
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
