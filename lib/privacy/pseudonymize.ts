/**
 * 仮名化（氏名⇄記号）の純粋ロジック。DOM/API/DB に依存しない（必ず単体テスト・機能仕様 §7）。
 *
 * なぜ存在するか:
 *   Claude API（海外）へは**記号のみ**を送るため、送信前に実名→記号へ置換する。
 *   画面表示時は権限内でのみ記号→実名に復元する。
 *
 * 表記ゆれ（独立審査 2026-09-11 D23）:
 *   文字起こし・OCR・コピー元は実名の途中に空白やゼロ幅文字を挟み、旧字体（髙→高）を新字体で出すことがある。
 *   nameRegex は「文字の間に空白類を許し、旧字体と新字体を同一視する」正規表現を作り、置換と漏れ検査の両方が使う。
 */

/** 実名と表示記号の対応。 */
export interface NameAlias {
  /** 実名（client_identities に暗号化保存。Claudeへは送らない） */
  real: string;
  /** 表示記号（例: "A様"。clients.code 由来） */
  code: string;
}

/** 旧字体⇄新字体の同一視表（よく名前に使われるもの。片方が登録・もう片方が入力でも当てる） */
const CHAR_VARIANTS: string[][] = [
  ["高", "髙"],
  ["崎", "﨑", "嵜"],
  ["辺", "邊", "邉"],
  ["斎", "齋", "斉", "齊"],
  ["沢", "澤"],
  ["浜", "濱", "濵"],
  ["桜", "櫻"],
  ["国", "國"],
  ["広", "廣"],
  ["恵", "惠"],
  ["徳", "德"],
  ["瀬", "瀨"],
  ["青", "靑"],
  ["野", "埜"],
  ["富", "冨"],
  ["島", "嶋", "嶌"],
  ["竜", "龍"],
  ["曽", "曾"],
  ["条", "條"],
  ["浅", "淺"],
  ["渕", "淵"],
  ["柳", "栁"],
];
const VARIANT_OF = new Map<string, string[]>();
for (const group of CHAR_VARIANTS) for (const ch of group) VARIANT_OF.set(ch, group);

const SPACE_CHARS = /[\s\u3000\u200b-\u200d\ufeff]+/g;
const SPACES = "[\\s\\u3000\\u200b-\\u200d\\ufeff]*";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 実名にゆるく一致する正規表現（g フラグ）。文字の間の空白類を許し、旧字体・新字体を同一視する。
 * 空白を除いて2文字未満なら null（1文字は誤置換が多いため対象外）。
 */
export function nameRegex(real: string): RegExp | null {
  const chars = [...real.replace(SPACE_CHARS, "")];
  if (chars.length < 2) return null;
  const body = chars
    .map((ch) => {
      const group = VARIANT_OF.get(ch);
      return group ? `[${group.map(escapeRegExp).join("")}]` : escapeRegExp(ch);
    })
    .join(SPACES);
  return new RegExp(body, "gu");
}

/**
 * テキスト中の実名を記号へ置換する。
 * 長い実名から先に置換し、姓だけが別名に巻き込まれる取りこぼしを防ぐ。
 */
export function maskNames(text: string, aliases: NameAlias[]): string {
  return maskNamesWithCount(text, aliases).text;
}

/** maskNames と同じ置換を行い、置換した箇所の数も返す（findings 用。原文は持たない）。 */
export function maskNamesWithCount(
  text: string,
  aliases: NameAlias[],
): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (const { real, code } of [...aliases].sort((a, b) => b.real.length - a.real.length)) {
    if (!real) continue;
    const re = nameRegex(real);
    if (re) {
      out = out.replace(re, () => {
        count++;
        return code;
      });
    } else {
      // 1文字の実名は完全一致のみ（ゆるい一致は誤置換が多い）
      const parts = out.split(real);
      count += parts.length - 1;
      out = parts.join(code);
    }
  }
  return { text: out, count };
}

/** テキスト中の記号を実名へ復元する（表示用・権限内でのみ使用）。 */
export function restoreNames(text: string, aliases: NameAlias[]): string {
  let out = text;
  for (const { real, code } of [...aliases].sort((a, b) => b.code.length - a.code.length)) {
    if (!code) continue;
    out = out.split(code).join(real);
  }
  return out;
}

/**
 * 帳票JSONの中の文字列をすべて記号→実名へ戻す（表示用・権限内のみ。二枚方式の「手元のフル版」）。
 * 保存する帳票は記号のまま（lib/db/documents.ts の契約）。画面とコピーにだけ使う。
 */
export function restoreNamesDeep<T>(value: T, aliases: NameAlias[]): T {
  if (typeof value === "string") return restoreNames(value, aliases) as T;
  if (Array.isArray(value)) return value.map((v) => restoreNamesDeep(v, aliases)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = restoreNamesDeep(v, aliases);
    }
    return out as T;
  }
  return value;
}

/**
 * 名簿の中で、同じ表記が違う記号に割り当たっていた時に投げる。
 *
 * なぜ: 「山田 花子（A様）」と「山田花子（B様）」のように**空白の有無だけが違う別人**が
 * 名簿にいると、以前は後から来た方を黙って捨てていた。捨てられた人の氏名は置換もされず
 * 漏れ検査にも掛からないまま AI へ出て、しかも本文の「A様」を戻すと**別人の氏名**になる。
 * 夫婦・兄弟が同じ事業所を使う、同姓同名がいる、移行前に二重登録した ── いずれも実在する
 * （独立審査 2026-09-13 critical）。黙って捨てず、送信を止める。
 */
export class AliasConflictError extends Error {
  constructor(count: number) {
    super(`名簿の中で同じ表記が違う記号に割り当たっています（${count}件）`);
    this.name = "AliasConflictError";
  }
}

/**
 * 実名の表記ゆれ（空白の有無）を展開して対応表を増やす（純粋関数）。
 * 例:「山田 花子」→「山田 花子」「山田花子」の両方を A様 に対応付ける。
 * 2文字未満（過剰置換の危険）や記号と同値は除外。姓のみは誤置換リスクが高いため展開しない
 * （運用ルール「メモに実名を書かない」が第一の防御・本関数はその安全網）。
 * ※ 空白ゆれ・旧字体は nameRegex でも吸収するが、対応表の見た目（復元時の実名）を保つため展開は残す。
 *
 * 同じ表記が**違う記号**に当たったら AliasConflictError を投げる（黙って捨てない）。
 * 同じ記号どうしの重複（同一人物の展開結果）は、これまでどおり1件にまとめる。
 */
export function expandAliasVariants(aliases: NameAlias[]): NameAlias[] {
  const seen = new Map<string, string>();
  const out: NameAlias[] = [];
  let conflicts = 0;
  for (const { real, code } of aliases) {
    const base = real.trim();
    for (const variant of [base, base.replace(/[\s　]+/g, "")]) {
      if (variant.length < 2 || variant === code) continue;
      const owner = seen.get(variant);
      if (owner !== undefined) {
        if (owner !== code) conflicts++;
        continue;
      }
      seen.set(variant, code);
      out.push({ real: variant, code });
    }
  }
  if (conflicts > 0) throw new AliasConflictError(conflicts);
  return out;
}

/**
 * 関係者（家族・担当者・主治医など）の記号を作る（純粋関数）。
 * 例: clientCode "A", relation "長女" → "A様の長女"。続柄は前後の空白を詰め、記号に使えない改行は落とす。
 * なぜ: 名簿にない人名は黒塗りで消えない（第1段の限界）。利用者ごとに関係者を登録し、この記号へ置き換える。
 */
export function relatedAliasCode(clientCode: string, relation: string): string {
  const rel = relation.replace(/[\r\n]+/g, " ").trim();
  return `${clientCode}様の${rel}`;
}

/**
 * 連番から利用者コードを生成する（0→A, 1→B, …, 25→Z, 26→AA, 27→AB …）。
 * org 内の既存件数を渡して次のコードを決める。表示は別途「様」を付す。
 */
/**
 * 記号（A・B・… Z・AA）を採番の番号に戻す。nextClientCode の逆。
 *
 * なぜ必要か: 記号は「名簿を共有する範囲で一意」でなければならない（同じ A様 が2人いると
 * 黒塗りの戻しが別人の実名になる）。件数で採番すると、事業所の行と組織加入前の自分の行が
 * 混ざったとき同じ番号を二度引く。既存の記号の**最大値の次**を取るために逆変換が要る。
 * 想定外の形（空・小文字以外の記号・7文字以上）は null を返し、呼び出し側が無視する。
 */
export function clientCodeIndex(code: string): number | null {
  const s = code.trim().toUpperCase();
  if (!/^[A-Z]{1,6}$/.test(s)) return null;
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function nextClientCode(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
