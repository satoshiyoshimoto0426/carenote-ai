import type { Appearance } from "@clerk/types";

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
 * 効いている範囲（2026-09-23 に /sign-in の実画面で計測）: `variables`（色・書体）は効いている。
 * `elements` の Tailwind クラス（枠線・shadow-none など）は、生成はされている（`@layer utilities`）が、
 * 層の外にある Clerk 自身のスタイルに負けて**画面には効いていない**（枠線 0px・影あり）。
 * 効かせるには Clerk の `cssLayerName`（型は @clerk/shared の GlobalAppearanceOptions）で Clerk のスタイルを
 * 層に入れる必要がある。組織切替（共有状態の表示）の見た目にも及ぶため、値の写しとは分けて判断する。
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
    card: "shadow-none border border-[#dfe3e7] rounded-[10px]", // --line
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
