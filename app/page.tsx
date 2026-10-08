import { redirect } from "next/navigation";
import { isSupportPlanAEdition, SUPPORT_PLAN_A_PATH } from "@/lib/supportPlan/edition";

/**
 * 「/」を開いたときの行き先 ＝ 利用者の一覧（/clients）。
 *
 * なぜ利用者か（吉本さん決定 2026-09-23・A案「作業台」）: 仕事は「誰の書類か」から始まるので、
 * ホームを利用者にする（それまでは点検の画面 /evaluate だった）。ナビ4項目の先頭も利用者（lib/nav.ts）。
 * ログイン直後の行き先は別の設定で決まる ── Clerk の NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL /
 * AFTER_SIGN_UP_URL（.env.local.example は /clients。本番の Vercel の値は吉本さんが変える）。
 * app/(dashboard)/page.tsx は作らない（「/」になるページが2つあるとビルドが落ちる）。
 * 例外: 個別支援計画書（就労A型）を単独で公開する版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=on ── lib/supportPlan/edition.ts）では、
 * 「/」をその画面（/support-plan-a）へ送る（2026-10-03 吉本さんの決定②・docs/specs/support-plan-a/README.md）。
 * テスト: app/page.test.ts。
 */
export default function RootPage() {
  if (isSupportPlanAEdition()) {
    redirect(SUPPORT_PLAN_A_PATH);
  } else {
    redirect("/clients");
  }
}
