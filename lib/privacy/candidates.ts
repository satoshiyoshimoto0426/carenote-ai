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

/**
 * 敬称。この直前の言葉を「名前かもしれない」として拾う。
 * 「先生」は 2026-09-17 に追加 ── 主治医は「◯◯先生」と書かれるのが普通なのに、
 * それまで1件も拾えていなかった（実測: 「田中先生に相談した」→ 候補ゼロ）。
 */
const HONORIFICS = ["さん", "様", "さま", "氏", "くん", "ちゃん", "先生"];

/**
 * 敬称に見えるが敬称ではない並び。直後がこの字なら数えない。
 *
 * なぜ要るか（2026-09-17 実測）:
 *   介護記録に頻出する「入浴の様子」「夜間の様子」の「様」を敬称と取り違え、
 *   直前の一般名詞（入浴・夜間・食事）を人名候補にしていた。会議の文字起こし1本で
 *   数百か所が赤くなり、**職員が1か所ずつ確かめること自体を不可能にする**。
 *   赤が多すぎる安全網は、赤が無いのと同じになる。
 */
const NOT_HONORIFIC_AFTER: Record<string, string> = {
  様: "子式相々態",
  氏: "名",
};
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
/** 「様子」のような並びを弾くため、敬称ごとに「直後に来てはいけない字」を付ける */
const HONORIFIC_ALT = HONORIFICS.map((h) =>
  NOT_HONORIFIC_AFTER[h] ? `${h}(?![${NOT_HONORIFIC_AFTER[h]}])` : h,
).join("|");
const HONORIFIC_RE = new RegExp(`([${JA}]{1,8})(${HONORIFIC_ALT})`, "gu");
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
