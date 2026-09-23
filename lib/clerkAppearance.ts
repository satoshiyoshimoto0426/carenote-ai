import type { Appearance } from "@clerk/types";

/**
 * Clerk 自身のスタイルを入れる CSS の層（@layer）の名前。
 *
 * なぜ存在するか（2026-09-23 に /sign-in の実画面で計測した不具合）:
 *   Clerk は画面の部品のスタイルを実行時に差し込む。層に入っていないスタイルは、層に入った
 *   Tailwind のクラス（`@layer utilities`）に詳細度と関係なく勝つ。そのため下の clerkAppearance.elements に
 *   書いたクラスが効かず、ログイン枠は枠線 0px・Clerk 既定の影のまま、組織切替（共有状態の表示の中にある
 *   事業所の切り替え）の `w-full` なども効いていなかった。
 *
 * 繋がる先（3か所で1組。どれか1つだけ変えると、また黙って効かなくなる）:
 *   - app/layout.tsx: ClerkProvider の appearance.cssLayerName にこの名前を渡す（Clerk のスタイルがこの層に入る）
 *   - app/globals.css 冒頭: `@layer theme, base, clerk, components, utilities;` で base の後・utilities の前に並べる
 *   - lib/clerkAppearance.test.ts: 上の2つがこの名前と順番を守っているかを確かめる
 */
export const CLERK_CSS_LAYER = "clerk";

/**
 * Clerk の画面（ログイン・新規登録・組織切替）をアプリ本体と同じ見た目に揃える設定。
 *
 * なぜ1か所にまとめるか:
 *   ログインと新規登録で別々に色を書いていたため、片方だけ直すとズレた。
 *   さらに旧設定は紺色＋青（#0f172a / #3b82f6）で、明るいアプリ本体と**最初の画面だけ**
 *   配色が違うという状態だった（2026-09-16 吉本さん指摘「AIが作った感」の主因）。
 *
 * 色と書体は app/globals.css のトークン（v2 = A案「作業台」）と同じ値を使う。Clerk は CSS 変数を
 * 解釈しない箇所があるため、ここだけは実際の16進数で持つ。以前はトークンを変えたときに
 * ここだけ取り残され、書体がずれていた（v1 で --sans を変えたのに Hiragino のままだった）。
 * いまは lib/clerkAppearance.test.ts が globals.css の :root を読んで突き合わせ、ずれたら落ちる。
 *
 * `elements` の Tailwind クラス（枠線・shadow-none など）が効く条件: Clerk 自身のスタイルが
 * CLERK_CSS_LAYER の層に入り、その層が utilities より前に並んでいること（上の CLERK_CSS_LAYER を参照）。
 * 2026-09-23 まではこれが無く、クラスは生成されているのに Clerk の層外スタイルに負けて画面に効いていなかった。
 *
 * 使う場所: app/(auth)/sign-in・sign-up のページと components/SharingStatus.tsx（組織切替）。
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorBackground: "#ffffff", // --card
    colorText: "#15181c", // --ink
    colorTextSecondary: "#59616a", // --muted
    colorPrimary: "#0e5c46", // --green
    colorInputBackground: "#ffffff", // --card
    colorInputText: "#15181c", // --ink
    colorDanger: "#a83226", // --clay
    colorSuccess: "#0e5c46", // --green
    colorWarning: "#9a5b06", // --amber
    borderRadius: "8px",
    fontFamily: '"IBM Plex Sans JP", "Hiragino Sans", "Yu Gothic UI", system-ui, sans-serif', // --sans
    fontSize: "14px",
  },
  elements: {
    // 外枠（cardBox）に 1px の線を引き、影を消す。中の card は影だけ消す ── card に線を引くと
    // cardBox の内側で二重線になり、線の太さぶん外枠からはみ出す（2026-09-23 /sign-in で計測）
    cardBox: "shadow-none border border-[#dfe3e7] rounded-[10px]", // --line
    card: "shadow-none",
    headerTitle: "text-[17px] font-bold text-[#15181c]", // --ink
    headerSubtitle: "text-[13px] text-[#59616a]", // --muted
    socialButtonsBlockButton: "border-[#d3d9de] text-[#15181c] hover:bg-[#f7f9fa]", // --btn-line / --ink / --surface-2
    formFieldLabel: "text-[12.5px] font-bold text-[#15181c]", // --ink
    formButtonPrimary: "bg-[#0e5c46] hover:bg-[#0a4735] text-white font-bold normal-case", // --green / --green-deep
    footerActionLink: "text-[#0e5c46] hover:text-[#0a4735] font-medium", // --green / --green-deep
    identityPreviewEditButton: "text-[#0e5c46]", // --green
    formResendCodeLink: "text-[#0e5c46]", // --green
  },
};
