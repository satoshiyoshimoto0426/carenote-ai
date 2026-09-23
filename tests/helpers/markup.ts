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
 *
 * なぜ parse5 か:
 *   jsdom が中で使っている HTML の読み取り部品そのもの（仕様どおりの読み方）。jsdom を丸ごと
 *   読み込むと手元で 5〜46 秒かかり、vitest の待ち時間を超えることがあるので、読む部分だけを使う。
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
 * HTML を読み、**すべての要素を出てくる順に**返す（入れ子の中も含む）。
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
 * 要素の中の**画面に出る文字だけ**をつなげて返す。
 * 属性（title・class など）の中身は入らない ── ふきだしだけにある文字を「見える」と数えないため。
 * `&amp;` などの書き換えは元の文字に戻る。
 */
export function textOf(node: MarkupNode): string {
  if (node.nodeName === "#text" && "value" in node) return node.value;
  return childrenOf(node).map(textOf).join("");
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
