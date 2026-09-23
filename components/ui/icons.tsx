import type { ReactNode } from "react";

/**
 * CareNote AI の線アイコン集（A案「作業台」でも同じ約束で使う）。
 *
 * なぜ自前で持つか: 画面に絵文字と塗りつぶしアイコンを使わない決まりがあり、
 * 外部のアイコン部品を入れずに 24×24 の線だけの SVG（端と角は丸）で揃えている。
 * 色は `currentColor` なので、置いた場所の文字色をそのまま受け継ぐ。
 *
 * どれも `aria-hidden="true"` を付けて出す（読み上げには、横に並ぶ文字を読ませる）。
 * これを外すと Biome の noSvgWithoutTitle（error）に当たる。守られていることは
 * `components/ui/icons.test.tsx` が全アイコンを1つずつ描いて確かめる。
 *
 * ナビの4項目（正本は `lib/nav.ts` の NAV_ITEMS）とアイコンの対応:
 * 利用者 = IconPeople ／ つくる = IconPencil ／ 点検 = IconCheckCircle ／ 使い方 = IconHelpCircle。
 * 選択中の項目は strokeWidth 1.8 で描く（A案のアートボード Main.dc.html の値）。
 */
export type IconProps = {
  /** 縦横の大きさ（px）。既定は 17。 */
  size?: number;
  /** 置き場所の Tailwind クラス（色は text-* で currentColor に渡る）。 */
  className?: string;
  /**
   * 線の太さ。既定は 1.6（全アイコン共通の太さ）。
   * なぜ変えられるか: A案のナビは選択中の項目だけ 1.8 で太く描き、小さな上下の矢印は 2 で描くため。
   */
  strokeWidth?: number;
};

/** 全アイコン共通の SVG の外枠。線の太さ・端の形・読み上げの扱いをここ1か所で決める。 */
function Svg({
  size = 17,
  className,
  strokeWidth = 1.6,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** 2人の人の形（旧デザイン）。つくるの「担当者会議（第4表）」ボタンで使う（ナビの利用者は IconPeople）。 */
export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  );
}

/**
 * 2人の人の形（A案）。ナビの「利用者」に使う。
 * なぜ IconUsers と別に持つか: A案のアートボード（Main.dc.html）の線の形が IconUsers と違うため。
 * 旧画面の見た目を変えないよう、IconUsers はそのまま残している。
 */
export function IconPeople(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M18 14.3c2.2.7 3.5 2.8 3.5 5.7" />
    </Svg>
  );
}

/** 鉛筆。ナビの「つくる」に使う（A案のアートボード Main.dc.html の線の形）。 */
export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

/** 丸で囲んだチェック。ナビの「点検」に使う（A案のアートボード Main.dc.html の線の形）。 */
export function IconCheckCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </Svg>
  );
}

/** マイク。A案の録音の帯（components/recording/ の画面内録音）の印に使う（アートボード Main.dc.html の線の形）。 */
export function IconMic(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </Svg>
  );
}

/** 文字のついた書類。書類の行・ファイルの印に使う。 */
export function IconFileText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </Svg>
  );
}

/** 重なった層。つくるの「支援経過（第5表）」ボタンなど一式まわりの印に使う。 */
export function IconLayers(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 2 10 5-10 5L2 7Z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </Svg>
  );
}

/** 虫めがね。つくるの「アセスメント」ボタンの印に使う。 */
export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="m21 21-4.7-4.7" />
    </Svg>
  );
}

/** 歯車。設定の入口用。 */
export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

/** 十字。「新しく足す」操作に使う。 */
export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

/** 重なった2枚の紙。コピーの操作に使う。 */
export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

/** チェックの印。できた・コピーした状態と、承認済みの印に使う。 */
export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m20 6-11 11-5-5" />
    </Svg>
  );
}

/** 右向きの山形。一覧の行・パンくず・開閉の印に使う。 */
export function IconChevronRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

/**
 * 上向きの山形。A案のアートボードでは「AIに送る文章」の赤い言葉を1つ前へ戻る操作に描かれている。
 * 押す場所は文字のボタン「前へ」のまま残す決定（パソコンに不慣れな職員向け）なので、使うときは文字に添える。
 */
export function IconChevronUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 15l6-6 6 6" />
    </Svg>
  );
}

/**
 * 下向きの山形。A案のアートボードでは「AIに送る文章」の赤い言葉を1つ先へ進む操作に描かれている。
 * 押す場所は文字のボタン「次へ」のまま残す決定（パソコンに不慣れな職員向け）なので、使うときは文字に添える。
 */
export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

/** 右向きの矢印。先へ進む操作の印に使う。 */
export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Svg>
  );
}

/** 錠前。ログインや個人情報の扱いの注意に使う。 */
export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="11" width="17" height="10" rx="2" />
      <path d="M7.5 11V7a4.5 4.5 0 0 1 9 0v4" />
    </Svg>
  );
}

/** 三角に感嘆符。エラーと、取り返しのつかない操作の注意に使う。 */
export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

/** 放射状の線。読み込み中の印に使う（回転のクラス animate-spin と組み合わせる）。 */
export function IconLoader(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <path d="m16.24 16.24 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="m16.24 7.76 2.83-2.83" />
    </Svg>
  );
}

/** 受け皿から上がる矢印。ファイルを選ぶ場所（一式まとめての参考資料）に使う。 */
export function IconUpload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </Svg>
  );
}

/** ごみ箱。選んだものを外す操作（例: 選んだ参考資料を外す）に使う。 */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

/** 時計。時系列の入力（一式まとめての「関わりの経過」）に使う。 */
export function IconClock(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Svg>
  );
}

/** 丸で囲んだ疑問符。ナビの「使い方」と、各画面の「この画面の使い方」リンクに使う。 */
export function IconHelpCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.2a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.4-2.6 3.9" />
      <path d="M12 17.5h.01" />
    </Svg>
  );
}

/** 丸で囲んだ再生の三角。使い方の動画の場所に使う。 */
export function IconPlayCircle(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.2 8.6 15.6 12l-5.4 3.4Z" />
    </Svg>
  );
}

/** 印刷機。印刷・PDF の配布物へのリンクに使う。 */
export function IconPrinter(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.5 9V3.5h11V9" />
      <path d="M6.5 17.5H5a2 2 0 0 1-2-2v-4.5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2V15.5a2 2 0 0 1-2 2h-1.5" />
      <rect x="6.5" y="14" width="11" height="6.5" rx="1" />
    </Svg>
  );
}

/** 受け皿へ下りる矢印。ファイルのダウンロードに使う（IconUpload の逆向き）。 */
export function IconDownload(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7.5 11 12 15.5 16.5 11" />
      <path d="M12 3v12.5" />
    </Svg>
  );
}

/** 丸で囲んだ「i」。使い方の中の説明の囲みに使う。 */
export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h.01" />
    </Svg>
  );
}
