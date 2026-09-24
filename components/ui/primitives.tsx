import Link from "next/link";
import type { ReactNode } from "react";
import { IconHelpCircle } from "./icons";

/**
 * CareNote AI の画面の部品（区画・見出し・ボタンのクラス）。
 *
 * なぜ: 部品の外部ライブラリを使わずに、見た目（トークンは app/globals.css）を全画面で揃えるため。
 * ページは生の要素に色や余白を書き足さず、ここの部品とクラスの定数を組み合わせる。
 * A案「作業台」（2026-09-23）で Pane / PaneHeader / SectionLabel / TextAction を足し、ボタンの寸法を
 * アートボードに揃えた。Card / PageHeader / SectionTitle はまだ作り替えていない画面が使うので残す
 * （全部の画面を作り替えたら片付ける ── 計画 X1）。
 */

/** 入力欄の共通の見た目（白い面・細い枠・角丸 8px）。文字の大きさは下の2つがそれぞれ1つだけ決める。 */
const fieldBase =
  "w-full rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-3 py-2.5 " +
  "text-[var(--ink)] placeholder:text-[var(--faint)]";

/**
 * 1行の入力欄・選ぶ欄のクラス（白い面・細い枠・14px）。
 * フォーカスの緑の枠は globals.css の input:focus-visible が付ける。
 * 使う所: つくる・救済モード・利用者の画面（新しい利用者・関係者名簿）・記録として残す欄。
 */
export const inputClass = `${fieldBase} text-sm`;

/**
 * 複数行の入力欄（メモ・人物像など）のクラス。本文はアートボードのメモ欄と同じ 14.5px・行の高さ 1.9
 * （長い文字起こしを読み返しやすく ── A案 R1・2026-09-24。以前は 14px・1.625）。
 * inputClass に大きさを足して上書きしない: 同じ性質（font-size）を決めるクラスが2つあると、
 * どちらが勝つかは Tailwind の出力の順で決まり、書いた順では決まらないため。
 */
export const textareaClass = `${fieldBase} text-[14.5px] leading-[1.9]`;

/**
 * 1行に並べる小さな入力欄・選ぶ欄（幅は中身なり・高さはパソコン 34px／スマホ 44px ── 脇のボタン btnSecondary と同じ高さ）。
 * inputClass に高さや幅を足して上書きしない（同じ性質を決めるクラスが2つあると、どちらが勝つかは Tailwind の出力の順で決まる。
 * 2026-09-24 に「記録として残す」欄の選ぶ欄が上下の余白に押されて文字が切れていたのを R1 の画面確認で見つけた）。
 * 使う所: components/create/SaveTranscriptBar.tsx（保存先の利用者・見出し）。
 */
export const inlineFieldClass =
  "h-11 rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-3 text-sm " +
  "text-[var(--ink)] placeholder:text-[var(--faint)] md:h-[34px]";

/**
 * 主ボタン（緑の地・白い文字）。**1画面に1つだけ**使う（A案の決まり ── 緑は「主ボタン」と「選択中の印」だけ）。
 *
 * 寸法は A案のアートボードの送信ボタン（Main.dc.html「この内容でAIに送る」）: 高さ 44px・左右 20px・
 * 角丸 8px・14px の太字。高さは min-h で約束する（文字が増えて折り返しても枠からはみ出さない）。
 * 44px はスマホで指で押せる大きさの決まりでもある。
 * 使う所: 各ページ（create / rescue / clients / dashboard）と components/FileUploader.tsx。
 * テスト: components/ui/primitives.test.tsx（44px を約束するクラスが条件なしで付いているか）。
 */
export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] bg-[var(--green)] px-5 py-1.5 " +
  "text-sm font-bold text-white transition-colors hover:bg-[var(--green-deep)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/**
 * 脇のボタン（白い地・細い枠・濃い文字）。主ボタン以外の「押す操作」に使う。
 *
 * 寸法は A案のアートボードの「新しい利用者」: パソコンでは高さ 34px・左右 12px・枠 --btn-line（#d3d9de）・
 * 角丸 8px・12.5px の文字。スマホ（768px 未満）では指で押せるよう高さ 44px にする（md: で 34px に戻す）。
 * 以前（v1）は文字が --muted の灰色で、押せる物に見えにくかった ── A案では本文と同じ --ink にした。
 * 使う所: 各ページ・components/recording/RecordingPanel.tsx・components/create/NotesField.tsx ほか。
 * テスト: components/ui/primitives.test.tsx。
 */
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--btn-line)] " +
  "bg-[var(--card)] px-3 py-1 text-[12.5px] leading-[1.5] text-[var(--ink)] transition-colors " +
  "hover:bg-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-[34px]";

/** クラス名を空白でつなぐ（空・undefined は捨てる）。この下の区画の部品だけが使う。 */
function cx(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * 区画（ペイン）── A案「作業台」の画面の単位。カードを積む代わりに、画面いっぱいの区画を
 * 1px の線だけで区切って並べる（吉本さん決定 2026-09-23・アートボード Main / A-clients）。
 *
 * 見た目と動きは app/globals.css の `.pane*`（@layer components）: 768px 以上では区画ごとに
 * 自分の中だけで縦に動き（左の入力を動かしても右の文章は動かない）、スマホでは縦に積む。
 * 区画は `<div className="panes">` の中に並べる（その div が横並びと区切り線を受け持つ）。
 *
 * @param width 決まった幅の区画（640 = つくるの入力、440 = 利用者の詳細）。省略すると残りの幅いっぱい。
 * @param tinted 地をほんの少し明るい --pane にする（右側の区画 ── AIに送る文章・利用者の詳細）。
 * @param as 要素の種類。主な作業の区画は section（既定）、脇の詳細は aside。
 * @param label 読み上げ用の区画の名前（aria-label）。付けると区画が「領域」として読み上げで飛べるようになる。
 * 使う所: 利用者（U1/U2）・つくる（C4）・点検（K2）で作り替える画面。テスト: components/ui/primitives.test.tsx。
 */
export function Pane({
  width,
  tinted = false,
  as: Tag = "section",
  label,
  className,
  children,
}: {
  width?: 640 | 440;
  tinted?: boolean;
  as?: "section" | "aside";
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      aria-label={label}
      className={cx("pane", width && `pane-${width}`, tinted && "pane-tinted", className)}
    >
      {children}
    </Tag>
  );
}

/**
 * 区画の頭の帯（高さ 48px・下に 1px の線）。768px 以上では区画を動かしても上に貼りつく。
 * **Pane の直下に置く**（直下にあると、区画の中で貼りつく物とフォーカスの止まる位置が、
 * この帯の高さぶん下がる ── globals.css の `.pane:has(> .pane-header)`。帯の裏に隠さないため）。
 *
 * @param title 区画の名前（h2 ── ページの見出し h1 は上の帯にある）。省略して、書類の種類の切り替えなどを
 *   children だけで並べてもよい。
 * 使う所: Pane と同じ。テスト: components/ui/primitives.test.tsx。
 */
export function PaneHeader({
  title,
  className,
  children,
}: {
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("pane-header", className)}>
      {title ? <h2 className="pane-title">{title}</h2> : null}
      {children}
    </div>
  );
}

/**
 * 区画の中の小見出し・欄の名前（12px の太字・字間 0.06em・--ink-2）。アートボードの「会議のメモ」。
 * htmlFor を渡すと、その入力欄に結んだ <label> になる（押すと欄に入れる・読み上げで欄の名前になる）。
 * 渡さなければ見出し（既定 h3。区画の名前 h2 の下に置くため）。
 * id を渡すと、まとまり（<section aria-labelledby>）の名前に使える（利用者の区画の「書類」「関係者名簿」など ── A6）。
 * 使う所: Pane と同じ。テスト: components/ui/primitives.test.tsx。
 */
export function SectionLabel({
  htmlFor,
  id,
  as: Tag = "h3",
  className,
  children,
}: {
  htmlFor?: string;
  id?: string;
  as?: "h2" | "h3" | "p";
  className?: string;
  children: ReactNode;
}) {
  if (htmlFor) {
    return (
      <label htmlFor={htmlFor} id={id} className={cx("section-label", className)}>
        {children}
      </label>
    );
  }
  return (
    <Tag id={id} className={cx("section-label", className)}>
      {children}
    </Tag>
  );
}

/**
 * 文字だけの操作（枠も地も無い 12.5px の文字）。アートボードの区画の下端の
 * 「録音ファイルから文字にする」「この欄を記録として残す」。緑の主ボタンは1画面に1つなので、
 * 脇の操作はこれで並べる。押す場所はスマホで 44px 以上（globals.css `.text-action`）。
 *
 * href を渡すと画面を移るリンク（next/link）、onClick を渡すとその場の操作のボタン（<button type="button">）。
 * 見た目だけ似せた div にはしない（キーボードと読み上げで操作できるようにするため）。
 * 使う所: つくる（C7）・利用者（U3b）で作り替える画面。テスト: components/ui/primitives.test.tsx。
 */
export function TextAction(
  props: { className?: string; children: ReactNode } & (
    | { href: string }
    | { onClick: () => void; disabled?: boolean }
  ),
) {
  const className = cx("text-action", props.className);
  if ("href" in props) {
    return (
      <Link href={props.href} className={className}>
        {props.children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={props.onClick} disabled={props.disabled} className={className}>
      {props.children}
    </button>
  );
}

/**
 * 各ページの見出し（h1）と1行の説明、「この画面の使い方」のリンク。
 *
 * 2026-09-16 の作り直し: 旧版は日本語の見出しの上に "CREATE" のような**ラテン文字の
 * アイブロウ**を置き、見出しを明朝体で組んでいた。これは生成AIが作る画面の典型で、
 * 情報も足していない（"CREATE" は「帳票作成」の上に置いても何も説明しない）。
 * 見出し1本に整理し、書体は本文と同じゴシックの太字にした。
 *
 * A案「作業台」（2026-09-24 R1）: 文字の大きさをアートボードの段階に揃えた ── 見出し 20px の太字
 * （--t-title）、説明 13px の --muted。「この画面の使い方」は上の帯（components/shell/TopBar.tsx）にも
 * あるので、ここでは小さく静かに添える（12px の --muted・枠も地も無し）。スマホでは押す場所を 44px にする。
 *
 * helpAnchor: 使い方ページの章アンカー（例 "ch3"）。渡すと見出しの右に
 * 「この画面の使い方」リンクが出て /guide#ch3 へ飛ぶ（迷った職員がその場で手順を open できる）。
 * 行き先が上の帯と同じであることは lib/nav.test.ts が確かめる。
 * 使う所: つくる・救済モード・点検・ダッシュボード・使い方（まだ上の帯へ見出しを移していない画面）。
 */
export function PageHeader({
  title,
  description,
  helpAnchor,
}: {
  title: string;
  description?: string;
  helpAnchor?: string;
}) {
  return (
    <header className="mb-[var(--sp-3)]">
      {/*
        2026-09-16: 以前は justify-between で「使い方」リンクを見出しの反対側へ飛ばしていた。
        見出しが短いページでは画面の真ん中にぽつんと浮いて、意図した配置に見えなかった。
        見出しのすぐ隣に添える形に変える。
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h1 className="text-[length:var(--t-title)] font-bold leading-[1.4] text-[var(--ink)]">
          {title}
        </h1>
        {helpAnchor ? (
          <Link
            href={`/guide#${helpAnchor}`}
            className="inline-flex flex-shrink-0 items-center gap-1.5 text-[12px] text-[var(--muted)] underline-offset-[3px] transition-colors hover:text-[var(--ink)] hover:underline max-md:min-h-11"
          >
            <IconHelpCircle size={13} />
            この画面の使い方
          </Link>
        ) : null}
      </div>
      {description ? (
        <p className="mt-1 text-[13px] leading-[1.7] text-[var(--muted)]">{description}</p>
      ) : null}
    </header>
  );
}

/**
 * まだ A案の区画に作り替えていない画面の「ひとまとまり」（1px の線で囲んだ白い面）。
 *
 * A案「作業台」（2026-09-24 R1）: 以前は角を 10px 丸めて影を付けた「カード」で、画面がカードを積んだ形
 * （生成AIの画面の典型 ── 吉本さんが2度却下した見た目）になっていた。角の丸みと影を外し、細い線（--line）で
 * 囲むだけの面にした。これ1か所を変えるだけで、作り替え前の画面（点検・ダッシュボード・使い方・救済モード）が
 * 一度にカードを積んだ見た目でなくなる。区画に作り替えた画面は使わない（Pane を使う ── 全部の画面を
 * 作り替えたら片付ける・計画 X1）。
 * 余白は持たない（呼ぶ側が p-5 / p-6 を className で渡す。Tailwind の指定がぶつからないように）。
 */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`border border-[var(--line)] bg-[var(--card)] ${className ?? ""}`}>
      {children}
    </div>
  );
}

/**
 * Mincho section heading (15px) — separates groups inside a page or card.
 * `as` で見出しレベルを選べる。既定 h2。章見出し（h2）の中に置く小見出しは h3 を渡して、
 * 読み上げソフトの見出しジャンプが平坦にならないようにする（検品 2026-09-12）。
 */
export function SectionTitle({
  className,
  children,
  as: Tag = "h2",
}: {
  className?: string;
  children: ReactNode;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      className={`text-[length:var(--t-section)] font-bold leading-[1.5] text-[var(--ink)] ${className ?? ""}`}
    >
      {children}
    </Tag>
  );
}

/**
 * 入力欄とそのラベル。ラベルは htmlFor で結び、補足があれば下に小さく添える。
 *
 * 2026-09-16: ラベルを 12px の薄いグレーから 13px の濃い太字へ。ラベルは「読み飛ばす
 * 装飾」ではなく「何を入れる欄か」を伝える本体なので、補足より強くする。
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-[var(--sp-1)] block text-[length:var(--t-label)] font-bold leading-[1.6] text-[var(--ink)]"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-[var(--sp-1)] text-[length:var(--t-meta)] leading-[1.7] text-[var(--faint)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
