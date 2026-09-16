/**
 * 合成音声（MiniMax）の読み間違いを直すための読み辞書。
 *
 * なぜ存在するか:
 *   ナレーションは台本（`docs/MANUAL-VIDEO-SPEC.md` §5）の文をそのまま読ませている。合成音声は
 *   「下書き」を『もとがき』、「主治医意見書」を『しゅうぎいんけんしょ』のように読み違えることがあり、
 *   長さも件数も正常なので**音を聞くまで気づけない**（2026-09-16・吉本さんの指摘で発覚）。
 *   そこで読みを明示して固定する。
 *
 * どうやって見つけるか:
 *   `tools/check-reading.mjs` が、出来た音声を文字起こしに掛け直して台本と突き合わせる。
 *   音が違った語だけをここへ足す（「氏名」→『使命』のような**同じ音の漢字違いは読み間違いではない**）。
 *
 * 何と繋がるか:
 *   使う側 = `tools/make-narration.mjs` → MiniMax の `pronunciation_dict.tone`
 *   検査   = `lib/manual/readingDict.test.ts`（台本に無い語・危ない重なり・漢字混じりの読みを落とす）
 *
 * ⚠ `pronunciation_dict` は**合成の前に文字列を置き換える**。「表/ひょう」のような短い語を入れると
 *   「表示」まで巻き込んで壊れる。`surface` は必ず長めに取り、他の語の一部にならない形にすること。
 */

export interface ReadingEntry {
  /** 台本に出てくる、そのままの文字列 */
  surface: string;
  /** 読ませたい音（かなのみ） */
  reading: string;
  /** なぜ要るのか。実際に聞こえた音を残す */
  why: string;
}

export const READING_DICT: readonly ReadingEntry[] = [
  {
    surface: "CareNote",
    reading: "ケアノート",
    why: "ch1-01 で「KLノート」（ケーエル／ケールノート）と聞こえた",
  },
  {
    surface: "デベロッパー",
    reading: "でべろっぱー",
    why: "ch5-01『拡張機能を、デベロッパー モードで読み込みます",
  },
  {
    surface: "主治医意見書",
    reading: "しゅじいいけんしょ",
    why: "ch6-04 で「衆議院憲書（しゅうぎいんけんしょ）」と聞こえた",
  },
  {
    surface: "入り直します",
    reading: "はいりなおします",
    why: "ch7-09「画面を読み込み直して入り直します」",
  },
  { surface: "仮名表示中", reading: "かめいひょうじちゅう", why: "実測 ch2-09" },
  { surface: "入った文章", reading: "はいったぶんしょう", why: "ch5-09「入った文章を確かめ」" },
  { surface: "この行に", reading: "このぎょうに", why: "ch3-06 差分由来" },
  {
    surface: "この文が",
    reading: "このぶんが",
    why: "ch7-02「この文が出たときは送信を止めています」",
  },
  { surface: "一つずつ", reading: "ひとつずつ", why: "ch6-03「一行に一つずつ、日付から書きます」" },
  { surface: "空のとき", reading: "からのとき", why: "ch7-01「必要な欄が空のときは」" },
  { surface: "空のまま", reading: "からのまま", why: "ch3-03「空のままでも次に進めます」" },
  { surface: "元に戻す", reading: "もとにもどす", why: "ch5-11「元に戻すで戻せます」" },
  { surface: "作成する", reading: "さくせいする", why: "ch4-02『さくせいスルー』" },
  {
    surface: "実在の方",
    reading: "じつざいのかた",
    why: "ch6-05「契約前は実在の方の書類を入れません」",
  },
  { surface: "食い違い", reading: "くいちがい", why: "ch6-08「食い違いが出たら」" },
  { surface: "人の名前", reading: "ひとのなまえ", why: "ch3-08・ch7-03「人の名前なら戻って直す」" },
  { surface: "ご家族", reading: "ごかぞく", why: "ch1-05 で「ゴイエ族」（ごいえぞく）と聞こえた" },
  { surface: "一番下", reading: "いちばんした", why: "ch4-08" },
  { surface: "下書き", reading: "したがき", why: "ch1-07 で「元書」（もとがき）と聞こえた" },
  { surface: "開いた", reading: "ひらいた", why: "ch2-04 で開が崩れた" },
  { surface: "空いた", reading: "あいた", why: "ch6-02「空いた欄はAIが想定して補います」" },
  { surface: "契約前", reading: "けいやくまえ", why: "ch6-05 に1件のみ（grep 実測）" },
  { surface: "合言葉", reading: "あいことば", why: "ch5-03「アドレスと合言葉を入れて」" },
  { surface: "今日は", reading: "きょうわ", why: "ch1-02「今日は利用者と作成するを使います」" },
  { surface: "次の章", reading: "つぎのしょう", why: "ch4-10" },
  {
    surface: "上から",
    reading: "うえから",
    why: "ch2-03「上から六つ並んでいます」/ch6-10「五枚の書類を上から順に」",
  },
  { surface: "帯の中", reading: "おびのなか", why: "ch3-06「帯の中のこの行に出ています」" },
  { surface: "第2表", reading: "だいにひょう", why: "ch5-12「第2表は、一件ずつ足して」" },
  {
    surface: "第5表",
    reading: "だいごひょう",
    why: "ch4-03「書類の種類は、支援経過、第5表を選びます」",
  },
  {
    surface: "AI",
    reading: "エーアイ",
    why: "ch1-10 / ch1-11 / ch3-05 / ch3-11 / ch3-13 / ch6-02 の6箇所",
  },
  { surface: "A様", reading: "えーさま", why: "ch1-04・ch1-05・ch2-08・ch2-12" },
  {
    surface: "の印",
    reading: "のしるし",
    why: "ch2-09 台本「…中の印が付いています」→ 聞こえた「…中の首都知らがついています」＝しゅとしら",
  },
  { surface: "一件", reading: "いっけん", why: "ch5-12「一件ずつ足して登録し」" },
  {
    surface: "一行",
    reading: "いちぎょう",
    why: "ch6-03「関わりの経過は、一行に一つずつ、日付から書きます」",
  },
  { surface: "一式", reading: "いっしき", why: "ch6-01「書類の一式をまとめて作ります」" },
  {
    surface: "一分",
    reading: "いっぷん",
    why: "ch1-10「一分ほど待ちます」/ch4-07「一分から二分ほど」",
  },
  { surface: "右上", reading: "みぎうえ", why: "ch1-03・ch2-05「右上の新規を押します」" },
  { surface: "下線", reading: "かせん", why: "ch3-07 差分由来" },
  {
    surface: "開き",
    reading: "ひらき",
    why: "ch1-01/ch1-06/ch2-02/ch2-04/ch2-05/ch3-01/ch5-02/ch5-05/ch6-01",
  },
  {
    surface: "開く",
    reading: "ひらく",
    why: "ch2-01「CareNote を開くと」/ch7-11「作成画面が開くだけです」",
  },
  { surface: "実名", reading: "じつめい", why: "ch1-11・ch3-11「実名で表示／実名の表示」" },
  { surface: "手元", reading: "てもと", why: "ch1-11「実名で表示は手元だけの表示です」" },
  {
    surface: "新規",
    reading: "しんき",
    why: "ch2-05 台本「右上の新規を押すと」→ 聞こえた「右上の神経を押すと」＝しんけい",
  },
  {
    surface: "続柄",
    reading: "つづきがら",
    why: "ch2-11 台本「続柄と氏名を入れて」→ 聞こえた「俗柄」＝ぞくがら",
  },
  { surface: "他の", reading: "ほかの", why: "ch7-12「他のカレンダーを使うときは」" },
  {
    surface: "二分",
    reading: "にふん",
    why: "ch4-07「一分から二分ほど」/ch6-06「三十秒から二分ほど」",
  },
  { surface: "日付", reading: "ひづけ", why: "ch6-03 で「筆（ふで）から書きます」と聞こえた" },
  { surface: "六つ", reading: "むっつ", why: "ch1-02 で「無通」（むつう／むつ）と聞こえた" },
];

/** 長い語から先に置き換わるよう、長さの降順にそろえる。 */
function byLengthDesc(a: ReadingEntry, b: ReadingEntry): number {
  return b.surface.length - a.surface.length || a.surface.localeCompare(b.surface);
}

/** MiniMax の `pronunciation_dict.tone` へ渡す形（`"下書き/したがき"`）。 */
export function toReadingTone(entries: readonly ReadingEntry[] = READING_DICT): string[] {
  return [...entries].sort(byLengthDesc).map((e) => `${e.surface}/${e.reading}`);
}

/** 台本に1度も出てこない語（台本を直したときの消し忘れ）。 */
export function unusedSurfaces(
  corpus: readonly string[],
  entries: readonly ReadingEntry[] = READING_DICT,
): string[] {
  return entries
    .filter((e) => !corpus.some((line) => line.includes(e.surface)))
    .map((e) => e.surface);
}

/**
 * ある語が別の語の一部になっている組み合わせ。
 * 置き換えの順番に関係なく事故になりうるので、見つかったら surface を取り直す。
 */
export function riskyOverlaps(
  entries: readonly ReadingEntry[] = READING_DICT,
): Array<{ shorter: string; longer: string }> {
  const out: Array<{ shorter: string; longer: string }> = [];
  for (const a of entries) {
    for (const b of entries) {
      if (a === b || a.surface.length >= b.surface.length) continue;
      if (b.surface.includes(a.surface)) out.push({ shorter: a.surface, longer: b.surface });
    }
  }
  return out;
}
