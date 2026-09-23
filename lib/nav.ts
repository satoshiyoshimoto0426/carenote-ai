/**
 * 画面の行き先の決まり（A案「作業台」のナビ4項目）── 純粋な関数だけを置く。
 *
 * なぜ存在するか: 2026-09-23 の吉本さんの決定で、左のメニューは6項目
 * （ダッシュボード／利用者／作成する／救済モード／評価する／使い方）から
 * 4項目（利用者／つくる／点検／使い方）になった。古い URL（/rescue・/dashboard）は
 * ブックマーク・マニュアル・撮影の道具が使っているので消さずに残し、
 * **どの項目の中にあるか**をここ1か所で決める。画面の部品（左の帯・下のタブ・上の帯の
 * 「この画面の使い方」）はここを読むだけにして、各画面が別々に判断しないようにする。
 *
 * 繋がる先: 左の帯と上の帯（components/shell/ ── 後のスライスで作る）、
 * 使い方の章（lib/manual/content.ts の MANUAL_CHAPTERS の id ＝ /guide#chN）。
 * テストは lib/nav.test.ts（古い URL の振り分けと、章の id が実在することを確かめる）。
 */

/** ナビの4項目の識別子。表示の名前は NAV_ITEMS の label。 */
export type NavSection = "clients" | "create" | "check" | "guide";

/** ナビの1項目。アイコンは画面の部品の側で決める（lib から components を読まないため）。 */
export interface NavItem {
  /** どの項目か（sectionOf の返り値と同じ）。 */
  section: NavSection;
  /** 画面に出す名前。 */
  label: string;
  /** 押したときの行き先。 */
  href: string;
}

/**
 * ナビの4項目（上から、または左から順に並べる）。
 * 点検の行き先は URL を変えずに /evaluate のまま（名前だけ「評価する」から「点検」へ）。
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { section: "clients", label: "利用者", href: "/clients" },
  { section: "create", label: "つくる", href: "/create" },
  { section: "check", label: "点検", href: "/evaluate" },
  { section: "guide", label: "使い方", href: "/guide" },
];

/**
 * つくるの「一式まとめて」を表す mode の値（/create?mode=bundle）。
 * いまは /rescue が同じ画面の役目を持ち、後のスライスで /create?mode=bundle へ移る。
 */
export const BUNDLE_MODE = "bundle";

/** URL のうち、ナビの項目を決める先頭の部分と、その項目の対応（古い URL も含む）。 */
const SECTION_PREFIXES: readonly (readonly [string, NavSection])[] = [
  ["/clients", "clients"],
  ["/create", "create"],
  // 救済モード → つくるの「一式まとめて」
  ["/rescue", "create"],
  ["/evaluate", "check"],
  // 旧ダッシュボード（評価の履歴）→ 点検の中へ
  ["/dashboard", "check"],
  ["/guide", "guide"],
];

/** 問い合わせ（?…）と見出しへの飛び先（#…）を落とし、パスだけにする。 */
function pathOnly(pathname: string): string {
  const end = pathname.search(/[?#]/);
  return end === -1 ? pathname : pathname.slice(0, end);
}

/**
 * いまの URL がナビのどの項目の中にあるかを返す。どれにも当たらなければ null
 * （ログイン画面や「/」など、ナビを光らせない場所）。
 *
 * 区切りの「/」までを見て判定する（/clients と /clients/abc は利用者、/clientsx は当たらない）。
 * usePathname() の値をそのまま渡す想定だが、?… や #… が付いていても外して読む。
 */
export function sectionOf(pathname: string): NavSection | null {
  const path = pathOnly(pathname);
  for (const [prefix, section] of SECTION_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return section;
  }
  return null;
}

/**
 * 画面ごとの「この画面の使い方」が飛ぶ先（/guide#chN の chN）を返す。無ければ null。
 *
 * - 利用者 → ch2
 * - つくる → ch3。ただし「一式まとめて」（mode=bundle か /rescue）なら ch6
 * - 点検 → ch1（点検の章ができるまでの仮。今の /evaluate と /dashboard と同じ行き先）
 * - 使い方 → なし（使い方の中から使い方へは飛ばさない）
 *
 * mode は useSearchParams().get("mode") の値をそのまま渡せるよう、null も受け取る。
 */
export function helpAnchorOf(pathname: string, mode?: string | null): string | null {
  const section = sectionOf(pathname);
  switch (section) {
    case "clients":
      return "ch2";
    case "create": {
      const path = pathOnly(pathname);
      const isRescue = path === "/rescue" || path.startsWith("/rescue/");
      return isRescue || mode === BUNDLE_MODE ? "ch6" : "ch3";
    }
    case "check":
      return "ch1";
    case "guide":
    case null:
      return null;
  }
}
