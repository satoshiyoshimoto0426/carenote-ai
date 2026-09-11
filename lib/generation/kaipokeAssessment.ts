import {
  KAIPOKE_ASSESSMENT_FIELDS,
  KAIPOKE_PAGE_TITLES,
  type KaipokeAssessmentSheet,
  safeLimit,
} from "@/lib/kaipoke/assessmentLayout";
import type { AssessmentDraft } from "@/types/assessment";
import { generateStructuredDraft } from "./structured";

/**
 * アセスメント下書き → カイポケ11ページの欄に合わせた文章（転記用シート）。
 *
 * なぜ存在するか:
 *   CareNote の下書きは課題分析14項目の構造、カイポケは「ページ×欄」の構造で、人が写すと1時間かかる
 *   （docs/KAIPOKE-TRANSCRIPTION-SPEC.md §6「文言生成→正規化→投入→検証」の「文言生成」）。
 *   欄ごとに文字数の安全上限を守り、根拠の無い欄は空にするか isInferred を立てる。
 *
 * 何と繋がるか:
 *   - 入力: AssessmentDraft（記号化済の下書き）＋任意の補足メモ（資料の読み取り結果など）
 *   - 出力: KaipokeAssessmentSheet → 画面（コピー貼り付け）／拡張（ページ単位の流し込み）
 */

const FIELD_KEYS = KAIPOKE_ASSESSMENT_FIELDS.map((f) => `p${f.page}:${f.formName}`);

const SHEET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: {
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "text", "isInferred", "note"],
        properties: {
          key: { type: "string", enum: FIELD_KEYS },
          text: { type: "string" },
          isInferred: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

export const KAIPOKE_ASSESSMENT_SYSTEM_PROMPT = `あなたは経験豊富なケアマネジャー（介護支援専門員）を補助するAIです。
CareNote で作ったアセスメントの下書きを、介護ソフト「カイポケ」のアセスメント画面（10ページ・欄ごと）に
そのまま貼れる文章に組み替えます。最終確認と登録は人間のケアマネジャーが行います。

以下のルールを厳守してください。

1. **下書きにある事実だけ**を欄に振り分ける。下書きに無いことは書かない。情報が無い欄は text を空文字にする。
2. どうしても文脈から補う場合は **isInferred を true** にし、note に「何を推測したか」を書く。空欄で済むなら推測しない。
3. 各欄の「安全上限（文字数・改行込み）」を**超えない**。超えそうなら要点を残して削る。1行あたりの幅も守る（幅を超える長い1行は改行で分ける）。
4. **氏名・住所・電話番号・医療機関名・事業所名は書かない**（利用者は「本人」、家族は続柄、医療機関は「かかりつけ医」等）。下書きに記号（A様 など）があればそのまま使う。
5. 使えない文字を避ける：「〜」は「から」または「～」、丸数字（①）は「(1)」、ローマ数字・㎡ 等の機種依存文字は使わない。大量の空白を入れない。改行は必要な所だけ。
6. 文体は「です・ます」ではなく記録体（〜している。〜が見られる。）。本人・家族の発言は「」で引用する。
7. 出力の key は欄の一覧にある値だけを使い、**すべての欄について1件ずつ**返す（空でも返す）。

出力は指定されたJSON構造のみで返してください。`;

/** 欄の一覧（ページ・ラベル・安全上限・ヒント）をAIに渡す文章にする純粋関数 */
export function buildFieldGuide(): string {
  const lines: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const fields = KAIPOKE_ASSESSMENT_FIELDS.filter((f) => f.page === page);
    if (fields.length === 0) continue;
    lines.push(`### ${page}枚目：${KAIPOKE_PAGE_TITLES[page]}`);
    for (const f of fields) {
      const size =
        typeof f.maxChars === "number"
          ? `最大${f.maxChars}字`
          : `最大${f.maxRows}行×全角${f.maxCols}字`;
      lines.push(
        `- key=p${f.page}:${f.formName} ｜ ${f.label} ｜ ${size} ｜ 安全上限${safeLimit(f)}字 ｜ ${f.hint}`,
      );
    }
  }
  return lines.join("\n");
}

/** ユーザーメッセージを組み立てる純粋関数（テスト対象） */
export function buildKaipokeAssessmentMessage(draft: AssessmentDraft, extraNotes?: string): string {
  const parts: string[] = [];
  parts.push(`## カイポケの欄一覧（この key だけを使う）\n${buildFieldGuide()}`);
  parts.push(`## CareNote のアセスメント下書き（JSON）\n${JSON.stringify(draft, null, 1)}`);
  const notes = extraNotes?.trim();
  if (notes) parts.push(`## 補足メモ（資料の読み取り結果など）\n${notes}`);
  parts.push(
    "上記の下書きを、欄一覧の各 key に振り分けてJSON構造で返してください。全ての key について1件ずつ、情報が無い欄は text を空文字に。安全上限を超えない。推測した欄は isInferred=true。",
  );
  return parts.join("\n\n");
}

/** AIの返事（key 形式）を画面・拡張で使う形（page/formName）に直す純粋関数 */
export function toSheet(raw: {
  fields: { key: string; text: string; isInferred: boolean; note: string }[];
}): KaipokeAssessmentSheet {
  const fields = raw.fields.flatMap((f) => {
    const m = /^p(\d+):(.+)$/.exec(f.key);
    if (!m) return [];
    return [
      {
        page: Number(m[1]),
        formName: m[2],
        text: f.text.trim(),
        isInferred: f.isInferred,
        note: f.note.trim(),
      },
    ];
  });
  return { fields };
}

export async function generateKaipokeAssessmentSheet(
  draft: AssessmentDraft,
  extraNotes?: string,
): Promise<KaipokeAssessmentSheet> {
  const raw = await generateStructuredDraft<{
    fields: { key: string; text: string; isInferred: boolean; note: string }[];
  }>({
    systemPrompt: KAIPOKE_ASSESSMENT_SYSTEM_PROMPT,
    userMessage: buildKaipokeAssessmentMessage(draft, extraNotes),
    schema: SHEET_SCHEMA,
  });
  return toSheet(raw);
}
