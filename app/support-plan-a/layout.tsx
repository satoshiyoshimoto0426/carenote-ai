import { UserButton } from "@clerk/nextjs";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isOpenPilotAt, isSupportPlanAEdition } from "@/lib/supportPlan/edition";

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
 * ログインは他の画面と同じく middleware.ts（Clerk）が守る。ただしログインなしの試行版（印 "open"・2026-10-05 吉本さんの決定）では
 *   この画面をログインなしで開ける ── そのときは上の帯の下に「架空のデータだけで」の注意を出す（名簿が無く名前が自動で
 *   置き換わらないため・独立審査 2026-10-04 中2）。ログインしていなければ UserButton は何も出さない。
 * テスト: app/support-plan-a/layout.test.tsx。
 */
export default async function SupportPlanALayout({ children }: { children: React.ReactNode }) {
  if (!isSupportPlanAEdition()) notFound();
  // 「ログインなし」の注意は、実際にログインなしで開いている名前のときだけ出す（本番の名前では出さない ── 再審査 小6）
  const host = ((await headers()).get("host") ?? "").split(":")[0];
  const open = isOpenPilotAt(host);
  return (
    <div className="min-h-dvh bg-[var(--paper)]">
      <header className="flex h-[var(--topbar-h)] items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--card)] px-4 md:px-8">
        <p className="text-[14.5px] font-bold text-[var(--ink)]">個別支援計画（就労A型）</p>
        <UserButton />
      </header>
      {open ? (
        <p
          role="note"
          className="border-b border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-2 text-[13px] leading-[1.7] text-[var(--ink)] md:px-8"
        >
          試行版（ログインなし）です。架空の利用者・架空の面談だけで試してください。本物の氏名や個人情報は入れないでください。
        </p>
      ) : null}
      <main>{children}</main>
    </div>
  );
}
