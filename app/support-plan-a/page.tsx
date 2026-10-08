import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupportPlanAWorkbench from "@/components/supportPlan/SupportPlanAWorkbench";
import { isSupportPlanAEdition } from "@/lib/supportPlan/edition";

/**
 * 就労A型の個別支援計画書（原案）を作る単独の画面（段階2・docs/specs/support-plan-a/README.md）。
 *
 * (dashboard) の外に置く: CareNote の外枠（Rail・TopBar）と名簿を使わない（2026-10-03 吉本さんの決定②「単独で出す」）。
 *   この画面だけの外枠（画面の名前・ログアウト）は同じフォルダの layout.tsx。
 * ログインは他の画面と同じく middleware.ts（Clerk）が守る（ログインなしの試行版＝印 "open" だけは、この画面と3つの道を開ける）。
 * 印 NEXT_PUBLIC_SUPPORT_PLAN_A=on（lib/supportPlan/edition.ts）のときだけ開ける。今の CareNote 本番では設定しない＝404。
 *   外枠（layout.tsx）でも止めているが、ページでも止める ── Next.js は画面を移るときに外枠を描き直さないことがあり、
 *   外枠だけの見張りに頼らないため。
 */
export const metadata: Metadata = {
  title: "個別支援計画書（就労A型）の原案づくり",
};

export default function SupportPlanAPage() {
  if (!isSupportPlanAEdition()) notFound();
  return <SupportPlanAWorkbench />;
}
