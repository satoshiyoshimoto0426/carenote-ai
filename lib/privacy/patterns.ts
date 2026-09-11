/**
 * 型で判別できる個人情報（電話番号・住所・生年月日など）の置換。純粋ロジック（DOM/API/DB 非依存）。
 *
 * なぜ存在するか:
 *   名簿置換（pseudonymize.maskNames）は登録済みの実名しか消せない。電話連絡の要約では
 *   番号や住所がそのまま出てくるため、「形が決まっているもの」を機械的に消す第2の黒塗りが要る
 *   （docs/specs/call-pipeline.md §2.1）。maskPii から呼ばれ、AIへ送る直前に適用される。
 *   置き換えた元の値は札入れ（vault.ts）が覚え、AIの返事で手元に戻す（§2.5 二枚方式）。
 *
 * 設計上の線引き:
 *   予定の日付（「9月12日に面談」）は**消さない**。消すとカレンダー登録と支援経過の日付が壊れる。
 *   生年月日は文脈語（生年月日・生まれ・誕生）がある場合と、昭和・大正・明治の年月日のみ対象。
 *
 * 表記ゆれ（独立審査 2026-09-11 critical #8）:
 *   IME の長音「ー」やダッシュ類で区切った番号、ドット区切り、+81、「TEL:」直後の詰めた番号も拾う。
 *   ここで拾えない形は leakCheck の「長い数字列」検査が止める（置換と検査を同じ正規表現に頼らない）。
 */
import type { PiiVault } from "./vault";

/** 置換した個人情報の種類。findings は種類と件数だけを持ち、原文は持たない（ログに残さないため）。 */
export type PiiKind = "phone" | "postal" | "email" | "address" | "birthdate" | "number";

export interface PatternFinding {
  kind: PiiKind;
  count: number;
}

/** 札の基本形。実際の札は末尾に連番が入る（〔電話番号1〕）。AIにも「何が消されたか」が伝わる表記。 */
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
 * 数字の間の区切りゆれを揃える前処理（maskPii の正規化から呼ぶ）。
 * - ゼロ幅文字（U+200B〜200D・FEFF）を除く（文字起こし・コピー元が挟むことがある）
 * - 数字に挟まれた長音「ー」・ダッシュ類（‐ − – —）を半角ハイフンにする（「090ー1234ー5678」）
 * ドット「.」は小数（52.3kg）を壊すので揃えず、電話番号ルール側の区切りとして扱う。
 */
export function normalizeDigitSeparators(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/(?<=\d)[ー‐−–—](?=\d)/g, "-");
}

/**
 * 電話番号の区切りとして許す文字（ハイフン類・括弧・ドット・中黒・空白）。
 * 置換ルールと漏れ検査（hasLongDigitRun）が**同じ定数**を使い、片方だけ広げて穴が空くのを防ぐ（CI 審査 2026-09-12）。
 */
const PHONE_SEP = "[-−‐()（）.・\\s]";

/** 区切りを無視して数字だけ数える（TEL: 直後などの判定用） */
function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

/**
 * 適用順に意味がある（メール→住所→郵便番号→番号類→電話）。
 * 区切りの無い10〜11桁は「被保険者番号」か「電話番号」か判別できないため、先に〔番号〕として消す
 * （種類の精度より「必ず消える」ことを優先）。区切りのある電話番号だけを〔電話番号〕にする。
 * valid を持つルールは、一致しても valid が false なら置換・検出しない（数字の数などの追加判定）。
 */
const RULES: { kind: PiiKind; re: RegExp; valid?: (m: string) => boolean }[] = [
  { kind: "email", re: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g },
  // 都道府県から番地（数字を含む）まで。「大阪府の事業所」のように数字が無ければ消さない
  {
    kind: "address",
    re: new RegExp(`(?:${PREFECTURES})[^\\s、。,.]{0,24}?\\d+(?:[-−‐]\\d+){0,3}(?:番地?|号)?`, "g"),
  },
  // 前に数字が無く、後ろに「区切り＋数字」が続かないものだけ（電話番号の一部「090-1234」を食わない）
  { kind: "postal", re: /〒?\s?(?<!\d)\d{3}[-−‐]\d{4}(?![-−‐]?\d)/g },
  // 4桁-4桁-4桁（空白・ハイフン区切りのマイナンバー等）
  { kind: "number", re: /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)/g },
  // 被保険者番号（10桁）・マイナンバー（12桁）など、区切り無しで並ぶ8〜12桁
  { kind: "number", re: /(?<!\d)\d{8,12}(?!\d)/g },
  // 国際表記 +81（0落ち）
  { kind: "phone", re: /\+81[\s-]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}(?!\d)/g },
  // 0始まり・市外局番1〜4桁・ハイフン／括弧／ドット／中黒／空白の区切りが1つ以上あるもの
  {
    kind: "phone",
    re: new RegExp(
      `(?<!\\d)0\\d{1,4}${PHONE_SEP}{1,3}\\d{1,4}${PHONE_SEP}{0,3}\\d{3,4}(?!\\d)`,
      "g",
    ),
  },
  // 「TEL:」「電話」「携帯」の直後は区切りが乱れていても（0901234-5678）10〜11桁なら電話番号とみなす
  {
    kind: "phone",
    re: /(?<=(?:TEL|Tel|tel|℡|電話|携帯)[番号:：\s]{0,4})0[\d\-()（）. ]{8,14}\d(?!\d)/g,
    valid: (m) => digitCount(m) === 10 || digitCount(m) === 11,
  },
  // 文脈語つきの西暦（年／／.／- 区切り）・和暦、または昭和以前の年月日（予定にはなり得ない）
  {
    kind: "birthdate",
    re: /(?:生年月日|生まれ|誕生日?)[：:\s]*(?:(?:19|20)\d{2}\s?[年/.-]?\s?|(?:昭和|平成|令和|大正|明治|[SHRTM])\s?\d{1,2}\s?年?\s?)\d{1,2}\s?[月/.-]\s?\d{1,2}\s?日?/g,
  },
  { kind: "birthdate", re: /(?:昭和|大正|明治)\s?\d{1,2}\s?年\s?\d{1,2}\s?月\s?\d{1,2}\s?日/g },
];

/**
 * 型で判別できる個人情報を札へ置換する。元の値は vault が覚える。
 * 呼び出し側（maskPii）で NFKC 正規化済みのテキストを渡す前提（全角数字は半角に揃っている）。
 */
export function maskPatterns(
  text: string,
  vault: PiiVault,
): { text: string; findings: PatternFinding[] } {
  let out = text;
  const counts = new Map<PiiKind, number>();
  for (const { kind, re, valid } of RULES) {
    out = out.replace(re, (match) => {
      if (valid && !valid(match)) return match;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      return vault.tokenFor(kind, match);
    });
  }
  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return { text: out, findings };
}

/** 置換せず「型に当たるものが残っているか」だけを調べる（漏れ検査用）。 */
export function detectPatterns(text: string): PiiKind[] {
  const kinds = new Set<PiiKind>();
  for (const { kind, re, valid } of RULES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      if (valid && !valid(m[0])) continue;
      kinds.add(kind);
      break;
    }
    re.lastIndex = 0;
  }
  return [...kinds];
}

/**
 * 置換ルールとは別系統の保守的な検査: 区切り（PHONE_SEP・3文字まで）を無視して10桁以上の数字が続いていれば
 * 「番号らしきもの」とみなす。置換ルールの取りこぼしがそのまま検査漏れになる同一原点を断つ
 * （独立審査 2026-09-11 critical #8）。日付「2026-09-11」は8桁なので当たらない。
 */
export function hasLongDigitRun(text: string): boolean {
  // 日付と時刻（2026-09-11 14:30）は数字が多くても番号ではないので先に除く
  const stripped = text
    .replace(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/g, " ")
    .replace(/\d{1,2}:\d{2}/g, " ");
  for (const m of stripped.matchAll(LONG_DIGIT_RUN)) {
    if (digitCount(m[0]) >= 10) return true;
  }
  return false;
}
/** 数字が区切り（3文字まで）を挟んで続く塊。区切りの定義は電話番号ルールと共有 */
const LONG_DIGIT_RUN = new RegExp(`\\d(?:${PHONE_SEP}{0,3}\\d)*`, "g");
