import { redirect } from "next/navigation";

/**
 * 「/」を開いたときの行き先 ＝ 利用者の一覧（/clients）。
 *
 * なぜ利用者か（吉本さん決定 2026-09-23・A案「作業台」）: 仕事は「誰の書類か」から始まるので、
 * ホームを利用者にする（それまでは点検の画面 /evaluate だった）。ナビ4項目の先頭も利用者（lib/nav.ts）。
 * ログイン直後の行き先は別の設定で決まる ── Clerk の NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL /
 * AFTER_SIGN_UP_URL（.env.local.example は /clients。本番の Vercel の値は吉本さんが変える）。
 * app/(dashboard)/page.tsx は作らない（「/」になるページが2つあるとビルドが落ちる）。
 * テスト: app/page.test.ts。
 */
export default function RootPage() {
  redirect("/clients");
}
