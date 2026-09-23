import { type DefaultTreeAdapterTypes, parseFragment } from "parse5";

/**
 * 描いた HTML（renderToStaticMarkup の出力）を**木として読む**ための、テスト専用の小道具。
 *
 * なぜ必要か（2026-09-23 作り直し計画 F0a・独立審査の指摘）:
 *   画面のテストが HTML を文字列のまま正規表現で見ていたため、
 *   ①「録音を始める」の disabled を、class の文字にある `disabled:`（Tailwind の書き方）で
 *     満たしてしまい、ボタンが押せる状態でも緑のままだった
 *   ②「敬称の前」を、ふきだし（title 属性）だけで満たしてしまい、画面に文字が出ていなくても緑だった
 *   ③「3</span>か所」が、全体の数か欄ごとの数かを区別できなかった
 *   属性・文字・入れ子を分けて読めば、この3つの空振りは起きない。
 *   さらに同日の検収で、文字を数えるときに**隠した要素**（hidden 属性・sr-only など）の中身まで
 *   数えていたため、理由を隠しても「文字で読める」検査が緑のままだと分かった。textOf はそれも数えない。
 *
 * なぜ parse5 か:
 *   jsdom が中で使っている HTML の読み取り部品そのもの（仕様どおりの読み方）。jsdom を丸ごと
 *   読み込むと手元で 5〜46 秒かかり、vitest の待ち時間を超えることがあるので、読む部分だけを使う。
 *   そのかわり CSS は当たらない。「見えるか」は HTML に書かれた印だけで決める（textOf の説明を参照）。
 *
 * 使う側: components/recording/RecordingPanel.test.tsx・components/drafts/PreSendPreview.test.tsx・
 * components/SharingStatus.test.tsx。この道具そのものの検査は tests/helpers/markup.test.ts。
 */

/** HTML の要素ひとつ（parse5 の既定の木の形）。 */
export type MarkupElement = DefaultTreeAdapterTypes.Element;

type MarkupNode = DefaultTreeAdapterTypes.Node;

function isElement(node: MarkupNode): node is MarkupElement {
  return "tagName" in node;
}

function childrenOf(node: MarkupNode): DefaultTreeAdapterTypes.ChildNode[] {
  return "childNodes" in node ? node.childNodes : [];
}

/**
 * 隠す印として見る class の1語。Tailwind の `hidden`（display:none）・`invisible`（visibility:hidden）・
 * `sr-only`（画面の外へ出し、読み上げだけに残す）。`overflow-hidden` や `md:hidden` は別の1語なので当たらない。
 */
const HIDING_CLASSES = ["hidden", "invisible", "sr-only"];

/**
 * その要素自身が「見る人か読み上げのどちらかに届かない」印を持っているか。textOf の下請け。
 * 見る印: hidden 属性（値は問わない）・aria-hidden="true"・class の1語（HIDING_CLASSES）・
 * style 属性の display:none / visibility:hidden。
 */
function hidesItself(el: MarkupElement): boolean {
  if (attrOf(el, "hidden") !== undefined) return true;
  if (attrOf(el, "aria-hidden") === "true") return true;
  if (HIDING_CLASSES.some((token) => hasClass(el, token))) return true;
  const style = (attrOf(el, "style") ?? "").replace(/\s/g, "").toLowerCase();
  return style.includes("display:none") || style.includes("visibility:hidden");
}

/**
 * HTML を読み、**すべての要素を出てくる順に**返す（入れ子の中も含む。隠した要素も返す）。
 * 絞り込みは呼ぶ側で filter する（例: tagName が button で文字が「録音を始める」のもの）。
 */
export function elementsOf(html: string): MarkupElement[] {
  const found: MarkupElement[] = [];
  const walk = (node: MarkupNode) => {
    if (isElement(node)) found.push(node);
    for (const child of childrenOf(node)) walk(child);
  };
  walk(parseFragment(html));
  return found;
}

/**
 * 要素の中の文字のうち、**見る人にも読み上げにも届くもの**だけをつなげて返す。
 * 「理由が文字で読める」「ボタンの文字が『次へ』」のような、出ていることを確かめる検査に使う。
 *
 * 数えないもの:
 *   - 属性（title・class など）の中身 ── ふきだしだけにある文字を「見える」と数えないため
 *   - 隠す印のある要素の中の文字。印は、その要素自身・祖先・入れ子のどこにあっても効く。
 *     印 = hidden 属性／aria-hidden="true"／class の1語 hidden・invisible・sr-only／
 *     style 属性の display:none・visibility:hidden
 *     （`hidden md:inline` はいちばん狭い幅＝電話で見えないので、隠れている扱い）
 *
 * 判定しないもの（ここで数えても、実際の画面では見えないことがある）:
 *   - CSS ファイル側の見え方（globals.css の class の定義・親の overflow・文字色と背景が同じ・大きさ 0 など）
 *   - `md:hidden` のような画面幅つきの隠し方（1語が hidden ではないので、見える扱い）
 *   - 閉じた <details> の中身
 *
 * 「出していない」ことを確かめるときは、この関数ではなく描いた HTML 全体を見る
 * （ここは隠した文字を数えないので、隠して出した文字を「出ていない」と取り違える）。
 * `&amp;` などの書き換えは元の文字に戻る。
 */
export function textOf(node: MarkupNode): string {
  let at: MarkupNode | null = node;
  while (at !== null) {
    if (isElement(at) && hidesItself(at)) return "";
    at = "parentNode" in at ? at.parentNode : null;
  }
  return reachableText(node);
}

/** textOf の下請け: 入れ子へ降りながら、隠す印のある要素を飛ばして文字をつなぐ。 */
function reachableText(node: MarkupNode): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  if (isElement(node) && hidesItself(node)) return "";
  return childrenOf(node).map(reachableText).join("");
}

/**
 * 属性の値を返す。無ければ undefined。
 * React は真の真偽属性を `disabled=""` と書くので、あれば空文字が返る。
 */
export function attrOf(el: MarkupElement, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/** class 属性を空白で区切った1語として持っているか（`presend-nav-x` や文字の一部には当たらない）。 */
export function hasClass(el: MarkupElement, token: string): boolean {
  return (attrOf(el, "class") ?? "").split(/\s+/).includes(token);
}

/**
 * 要素の中（入れ子を含む）から、条件に合う要素を出てくる順に返す。
 * 「帯の中に数が出ているか」のように、場所を決めてから中を見るときに使う。
 */
export function within(el: MarkupElement, match: (e: MarkupElement) => boolean): MarkupElement[] {
  const found: MarkupElement[] = [];
  const walk = (node: MarkupNode) => {
    for (const child of childrenOf(node)) {
      if (isElement(child)) {
        if (match(child)) found.push(child);
        walk(child);
      }
    }
  };
  walk(el);
  return found;
}
