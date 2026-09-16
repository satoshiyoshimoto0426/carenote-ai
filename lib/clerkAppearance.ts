import type { Appearance } from "@clerk/types";

/**
 * Clerk の画面（ログイン・新規登録・組織切替）をアプリ本体と同じ見た目に揃える設定。
 *
 * なぜ1か所にまとめるか:
 *   ログインと新規登録で別々に色を書いていたため、片方だけ直すとズレた。
 *   さらに旧設定は紺色＋青（#0f172a / #3b82f6）で、明るいアプリ本体と**最初の画面だけ**
 *   配色が違うという状態だった（2026-09-16 吉本さん指摘「AIが作った感」の主因）。
 *
 * 色は app/globals.css のトークンと同じ値を使う。Clerk は CSS 変数を解釈しない箇所が
 * あるため、ここだけは実際の16進数で持つ（トークンを変えたらここも合わせること）。
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorBackground: "#ffffff",
    colorText: "#10151a",
    colorTextSecondary: "#47535f",
    colorPrimary: "#0e5c46",
    colorInputBackground: "#ffffff",
    colorInputText: "#10151a",
    colorDanger: "#a83226",
    colorSuccess: "#0e5c46",
    colorWarning: "#9a5b06",
    borderRadius: "8px",
    fontFamily: '"Hiragino Sans", "Yu Gothic UI", system-ui, sans-serif',
    fontSize: "14px",
  },
  elements: {
    card: "shadow-none border border-[#dbe2e8] rounded-[10px]",
    headerTitle: "text-[17px] font-bold text-[#10151a]",
    headerSubtitle: "text-[13px] text-[#47535f]",
    socialButtonsBlockButton: "border-[#dbe2e8] text-[#10151a] hover:bg-[#f7f9fa]",
    formFieldLabel: "text-[12.5px] font-bold text-[#10151a]",
    formButtonPrimary: "bg-[#0e5c46] hover:bg-[#0a4735] text-white font-bold normal-case",
    footerActionLink: "text-[#0e5c46] hover:text-[#0a4735] font-medium",
    identityPreviewEditButton: "text-[#0e5c46]",
    formResendCodeLink: "text-[#0e5c46]",
  },
};
