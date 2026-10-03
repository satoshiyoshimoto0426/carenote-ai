import { UserButton } from "@clerk/nextjs";
import { notFound } from "next/navigation";
import { isSupportPlanAEdition } from "@/lib/supportPlan/edition";

/**
 * 就労A型の個別支援計画書の画面だけの外枠（段階2・docs/specs/support-plan-a/README.md）。
 *
 * なぜ CareNote の外枠（app/(dashboard)/layout.tsx の Rail・TopBar）を使わないか:
 *   2026-10-03 吉本さんの決定②「今の CareNote AI のメニューには足さず、単独で出す」。
 *   CareNote のナビ・名簿の共有状態・事業所の切り替えは、この版では使わない（名簿を使わない画面のため）。
 * ここで出すもの: 上の帯に画面の名前「個別支援計画（就労A型）」と、ログアウトのための Clerk の UserButton
 *   （押すとアカウントのメニュー。単独の版では他にログアウトの道が無い）。
 * 印（NEXT_PUBLIC_SUPPORT_PLAN_A ── lib/supportPlan/edition.ts）が無い今の CareNote 本番では notFound()。
 *   ページ（page.tsx）ではなくこの外枠で止める ── ページで止めると、404 の画面がこの外枠（画面の名前）ごと出てしまう。
 * ログインは他の画面と同じく middleware.ts（Clerk）が守る（公開の道は増やしていない）。
 * テスト: app/support-plan-a/layout.test.tsx。
 */
export default function SupportPlanALayout({ children }: { children: React.ReactNode }) {
  if (!isSupportPlanAEdition()) notFound();
  return (
    <div className="min-h-dvh bg-[var(--paper)]">
      <header className="flex h-[var(--topbar-h)] items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--card)] px-4 md:px-8">
        <p className="text-[14.5px] font-bold text-[var(--ink)]">個別支援計画（就労A型）</p>
        <UserButton />
      </header>
      <main>{children}</main>
    </div>
  );
}
