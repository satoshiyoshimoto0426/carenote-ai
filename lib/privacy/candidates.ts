/**
 * 「名前っぽいのに消せなかった言葉」の候補を見つける。純粋ロジック（確率的・取りこぼしあり）。
 *
 * なぜ存在するか:
 *   名簿にない人名（家族・他事業所の担当者）と施設名は黒塗りで消えない（docs/specs/call-pipeline.md §2.4）。
 *   送る前の画面で赤く示し、職員が目で止める（§2.1 第2段）。ここは置換せず「示す」だけ。
 *   固有表現抽出（GiNZA 等）を使う上級版までのつなぎで、敬称と施設語尾という「形」だけで拾う。
 */

export interface NameCandidate {
  word: string;
  /** なぜ候補にしたか（画面に表示する短い理由） */
  reason: "敬称の前" | "施設名の可能性";
}

/** 敬称の前に来ても人名ではない言葉（役割・続柄・一般名詞） */
const STOPWORDS = new Set([
  "利用者",
  "ご利用者",
  "本人",
  "ご本人",
  "患者",
  "職員",
  "先生",
  "看護師",
  "ケアマネ",
  "相談員",
  "ヘルパー",
  "担当者",
  "担当",
  "皆",
  "みな",
  "皆様",
  "みなさん",
  "お客",
  "家族",
  "ご家族",
  "お母",
  "お父",
  "母",
  "父",
  "お姉",
  "お兄",
  "娘",
  "息子",
  "奥",
  "旦那",
  "妻",
  "夫",
  "兄",
  "姉",
  "弟",
  "妹",
  "孫",
  "嫁",
  "婿",
  "長女",
  "長男",
  "次女",
  "次男",
  "三女",
  "三男",
  "祖母",
  "祖父",
  "おばあ",
  "おじい",
  "お婆",
  "お爺",
  "叔母",
  "叔父",
  "伯母",
  "伯父",
  "お孫",
  "ご主人",
  "奥様",
]);

const HONORIFICS = ["さん", "様", "さま", "氏", "くん", "ちゃん"];
const ORG_SUFFIXES = [
  "病院",
  "クリニック",
  "医院",
  "診療所",
  "薬局",
  "事業所",
  "センター",
  "デイサービス",
  "ホーム",
  "施設",
  "会社",
];

const JA = "\\p{Script=Han}\\p{Script=Katakana}\\p{Script=Hiragana}ー";
const HONORIFIC_RE = new RegExp(`([${JA}]{1,8})(${HONORIFICS.join("|")})`, "gu");
const ORG_RE = new RegExp(`([${JA}]{1,12}(?:${ORG_SUFFIXES.join("|")}))`, "gu");
/** 助詞・読点・敬称で区切り、最後の塊だけを候補にする（「長女の佐藤さん」→「佐藤」） */
const SPLIT_RE = new RegExp(`[のはがとにをでもへ、。・]|${HONORIFICS.join("|")}`, "u");

/**
 * 候補を返す（重複は1つに）。黒塗り後のテキストを渡す前提（登録実名は既に消えている）。
 * 札（〔…〕）や記号（A様）は候補にしない。
 */
export function findNameCandidates(text: string): NameCandidate[] {
  const seen = new Set<string>();
  const out: NameCandidate[] = [];
  const push = (word: string, reason: NameCandidate["reason"]) => {
    if (!word || word.includes("〔") || seen.has(word)) return;
    seen.add(word);
    out.push({ word, reason });
  };

  for (const m of text.matchAll(HONORIFIC_RE)) {
    const word = lastSegment(m[1]);
    if (word && !STOPWORDS.has(word) && !isHiraganaOnlyShort(word)) push(word, "敬称の前");
  }
  for (const m of text.matchAll(ORG_RE)) {
    const word = lastSegment(m[1]);
    // 語尾だけ（「病院」単独）は一般名詞なので候補にしない
    if (word && !ORG_SUFFIXES.includes(word)) push(word, "施設名の可能性");
  }
  return out;
}

function lastSegment(word: string): string {
  const parts = word.split(SPLIT_RE).filter((p) => p.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

/** ひらがな1〜2文字だけ（「その」「この」など）は誤検知が多いので除く */
function isHiraganaOnlyShort(word: string): boolean {
  return word.length <= 2 && /^[\p{Script=Hiragana}ー]+$/u.test(word);
}
