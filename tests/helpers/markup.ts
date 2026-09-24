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
 *   翌日の検収で、同じ穴が**要素の数え方**にも残っていた（切り替えの部品を隠しても「出ている」と数えた）。
 *   部品そのものが出ているかは isReachable で見る。
 *
 * なぜ parse5 か:
 *   jsdom が中で使っている HTML の読み取り部品そのもの（仕様どおりの読み方）。jsdom を丸ごと
 *   読み込むと手元で 5〜46 秒かかり、vitest の待ち時間を超えることがあるので、読む部分だけを使う。
 *   そのかわり CSS は当たらない。「見えるか」は HTML に書かれた印だけで決める（textOf の説明を参照）。
 *
 * 使う側: components/recording/RecordingPanel.test.tsx・components/drafts/PreSendPreview.test.tsx・
 * components/SharingStatus.test.tsx・components/shell/{TopBar,Rail}.test.tsx・app/(dashboard)/layout.test.tsx。
 * jsdom で動かす画面の検査（components/clients/*.test.tsx・components/shell/TopBarSlot.live.test.tsx・
 * tests/ui/clientListErrors.live.test.tsx）は、markupOf・shownText・isShown を通して同じ判定で読む。
 * この道具そのものの検査は tests/helpers/markup.test.ts と tests/helpers/markupDom.live.test.ts（jsdom の橋）。
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
 * その要素自身が「見る人か読み上げのどちらかに届かない」印を持っているか。isReachable と textOf の下請け。
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
 * 部品が「出ている」ことを数えるときは isReachable でも絞る（隠した部品を出ていると数えないため）。
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
  return isReachable(node) ? reachableText(node) : "";
}

/**
 * その要素（または文字）そのものが、**見る人にも読み上げにも届くか**。
 * その要素自身か祖先のどれかに隠す印があれば false（印は textOf と同じ hidesItself で見る）。
 *
 * なぜ必要か（2026-09-24 検収）:
 *   elementsOf は隠した要素も返す。共有状態の検査は切り替えの部品を elementsOf で数えていたため、
 *   包む div に class="hidden" や aria-hidden="true" を付けて隠しても「切り替えが出ている」が緑だった。
 *   textOf が文字について塞いだ穴（隠した要素の文字を数えない）が、要素の数え方には残っていた。
 *   文字ではなく**部品が出ていること**（切り替え・チェックの印・赤い印）を数えるときは、先にこれで絞る。
 *
 * 入れ子の奥の印は見ない（中の一部が隠れていても、その要素そのものは出ている）。
 * 判定しないもの（CSS ファイル側の見え方・`md:hidden` のような画面幅つきの隠し方・閉じた <details>）は textOf と同じ。
 */
export function isReachable(node: MarkupNode): boolean {
  let at: MarkupNode | null = node;
  while (at !== null) {
    if (isElement(at) && hidesItself(at)) return false;
    at = "parentNode" in at ? at.parentNode : null;
  }
  return true;
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
/** 要素の子のうち、要素だけ（文字の節は数えない）。markupOf の下請け。 */
function childElementsOf(node: MarkupElement): MarkupElement[] {
  return childrenOf(node).filter(isElement);
}

/**
 * 動かした画面（jsdom の live テスト）の要素 target を、root を HTML に書き出して読み直した木の
 * **同じ場所の要素**にして返す。live テストでも textOf・isReachable をそのまま使うための橋。
 *
 * なぜ必要か（2026-09-24 枝 redesign/a-backend を redesign/a へ取り込んだとき）:
 *   jsdom の textContent は、隠した要素（hidden 属性・class の sr-only・aria-hidden など）の文字も数える。
 *   利用者の画面の検査（components/clients/*.test.tsx・components/shell/TopBarSlot.live.test.tsx）は
 *   「出ている」を textContent で見ていたので、「仮名表示中」や「承認後にコピーできます」を sr-only で隠しても
 *   緑のままになる（2026-09-23 に送る前の画面・録音で見つかった空振りと同じ種類）。
 *   木の要素にすれば、祖先の隠す印まで見る textOf・isReachable で確かめられる。
 *
 * 場所は root から target まで「何番目の子要素か」の並びでたどる（文字の節は数えない ── React が並べた
 * 文字の節は、HTML に書き出して読み直すと1つにまとまるため）。途中で要素の名前が食い違ったら、別の要素を
 * 黙って返さずに投げる（<p> の中の <div> のように、React が作る木と HTML として読んだ木の形が違う書き方に気づくため）。
 * target が root の中に無ければ投げる。root 自身を渡せば root そのものの木を返す。
 * 使う側は shownText・isShown（null を「出ていない」として扱う形）を通すのがふつう。
 */
export function markupOf(root: Element, target: Element): MarkupElement {
  const path: Element[] = [];
  for (let at: Element = target; at !== root; ) {
    const parent = at.parentElement;
    if (parent === null) {
      throw new Error(`markupOf: <${target.tagName.toLowerCase()}> は root の中にありません`);
    }
    path.unshift(at);
    at = parent;
  }
  const sameTag = (el: MarkupElement | undefined, dom: Element) =>
    el !== undefined && el.tagName.toLowerCase() === dom.tagName.toLowerCase();
  let node: MarkupElement | undefined = elementsOf(root.outerHTML)[0];
  if (!sameTag(node, root)) {
    throw new Error(
      `markupOf: root の <${root.tagName.toLowerCase()}> を HTML として読み直せません`,
    );
  }
  for (const dom of path) {
    const index = dom.parentElement ? Array.from(dom.parentElement.children).indexOf(dom) : -1;
    const next: MarkupElement | undefined = node ? childElementsOf(node)[index] : undefined;
    if (!sameTag(next, dom)) {
      throw new Error(
        `markupOf: <${dom.tagName.toLowerCase()}> は、HTML として読み直すと同じ場所にありません` +
          "（React が作った形を HTML が許さない入れ子 ── 例: <p> の中の <div> ── のおそれ）",
      );
    }
    node = next;
  }
  if (node === undefined) throw new Error("markupOf: 読み直した木が空です");
  return node;
}

/**
 * root の中の要素 target の、見る人にも読み上げにも届く文字（textOf）。
 * target が null・undefined なら ""（querySelector で見つからなかった＝出ていない、と同じに扱う。
 * root 全体を見るときは root を2つ目にも渡す ── 見つからなかった要素を黙って root 全体に読み替えないため）。
 * 「出ている」を確かめる検査に使う。「出していない」は textContent や innerHTML 全体で見る（textOf の説明と同じ理由）。
 */
export function shownText(root: Element, target: Element | null | undefined): string {
  return target ? textOf(markupOf(root, target)) : "";
}

/**
 * root の中の要素 target が、見る人にも読み上げにも届くか（isReachable）。null・undefined なら false。
 * ボタンや欄のように、文字ではなく部品が出ていることを確かめるときに使う。
 */
export function isShown(root: Element, target: Element | null | undefined): boolean {
  return target ? isReachable(markupOf(root, target)) : false;
}
