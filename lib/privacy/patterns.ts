/**
 * 型で判別できる個人情報（電話番号・住所・生年月日など）の置換。純粋ロジック（DOM/API/DB 非依存）。
 *
 * なぜ存在するか:
 *   名簿置換（pseudonymize.maskNames）は登録済みの実名しか消せない。電話連絡の要約では
 *   番号や住所がそのまま出てくるため、「形が決まっているもの」を機械的に消す第2の黒塗りが要る
 *   （docs/specs/call-pipeline.md §2.1）。maskPii から呼ばれ、AIへ送る直前に適用される。
 *
 * 設計上の線引き:
 *   予定の日付（「9月12日に面談」）は**消さない**。消すとカレンダー登録と支援経過の日付が壊れる。
 *   生年月日は文脈語（生年月日・生まれ・誕生）がある場合と、昭和・大正・明治の年月日のみ対象。
 */

/** 置換した個人情報の種類。findings は種類と件数だけを持ち、原文は持たない（ログに残さないため）。 */
export type PiiKind = "phone" | "postal" | "email" | "address" | "birthdate" | "number";

export interface PatternFinding {
  kind: PiiKind;
  count: number;
}

/** 置換後のトークン。AIにも「何が消されたか」が伝わる表記にする。 */
export const PII_TOKEN: Record<PiiKind, string> = {
  phone: "〔電話番号〕",
  postal: "〔郵便番号〕",
  email: "〔メール〕",
  address: "〔住所〕",
  birthdate: "〔生年月日〕",
  number: "〔番号〕",
};

const PREFECTURES =
  "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|" +
  "新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|" +
  "和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|" +
  "大分県|宮崎県|鹿児島県|沖縄県";

/**
 * 適用順に意味がある（メール→住所→郵便番号→番号類→電話）。
 * 区切りの無い10〜11桁は「被保険者番号」か「電話番号」か判別できないため、先に〔番号〕として消す
 * （種類の精度より「必ず消える」ことを優先）。区切りのある電話番号だけを〔電話番号〕にする。
 */
const RULES: { kind: PiiKind; re: RegExp }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  // 都道府県から番地（数字を含む）まで。「大阪府の事業所」のように数字が無ければ消さない
  {
    kind: "address",
    re: new RegExp(`(?:${PREFECTURES})[^\\s、。,.]{0,24}?\\d+(?:[-−‐]\\d+){0,3}(?:番地?|号)?`, "g"),
  },
  // 前に数字が無く、後ろに「区切り＋数字」が続かないものだけ（電話番号の一部「090-1234」を食わない）
  { kind: "postal", re: /〒?\s?(?<!\d)\d{3}[-−‐]\d{4}(?![-−‐]?\d)/g },
  // 被保険者番号（10桁）・マイナンバー（12桁）など、区切り無しで並ぶ8〜12桁
  { kind: "number", re: /(?<!\d)\d{8,12}(?!\d)/g },
  // 0始まり・市外局番1〜4桁・ハイフン／括弧／空白の区切りが1つ以上あるもの
  { kind: "phone", re: /(?<!\d)0\d{1,4}[-−‐(（\s]\d{1,4}[-−‐)）\s]?\d{3,4}(?!\d)/g },
  // 文脈語つきの西暦・和暦、または昭和以前の年月日（予定にはなり得ない）
  {
    kind: "birthdate",
    re: /(?:生年月日|生まれ|誕生日?)[：:\s]*(?:(?:19|20)\d{2}|(?:昭和|平成|令和|大正|明治|[SHRTM])\s?\d{1,2})\s?年?\s?\d{1,2}\s?[月/.-]\s?\d{1,2}\s?日?/g,
  },
  { kind: "birthdate", re: /(?:昭和|大正|明治)\s?\d{1,2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日/g },
];

/**
 * 型で判別できる個人情報をトークンへ置換する。
 * 呼び出し側（maskPii）で NFKC 正規化済みのテキストを渡す前提（全角数字は半角に揃っている）。
 */
export function maskPatterns(text: string): { text: string; findings: PatternFinding[] } {
  let out = text;
  const counts = new Map<PiiKind, number>();
  for (const { kind, re } of RULES) {
    out = out.replace(re, () => {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      return PII_TOKEN[kind];
    });
  }
  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return { text: out, findings };
}

/** 置換せず「型に当たるものが残っているか」だけを調べる（漏れ検査用）。 */
export function detectPatterns(text: string): PiiKind[] {
  const kinds = new Set<PiiKind>();
  for (const { kind, re } of RULES) {
    re.lastIndex = 0;
    if (re.test(text)) kinds.add(kind);
    re.lastIndex = 0;
  }
  return [...kinds];
}
