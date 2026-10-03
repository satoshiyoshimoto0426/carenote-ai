import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SupportPlanAWorkbench from "@/components/supportPlan/SupportPlanAWorkbench";
import { supportPlanAMode } from "@/lib/supportPlan/standalone";

/**
 * 就労A型の個別支援計画書（原案）を作る単独の画面（段階2・docs/TASK-LEDGER.md T-SPA-01）。
 *
 * (dashboard) の外に置く: CareNote の外枠（Rail・TopBar）と名簿を使わない（2026-10-03 吉本さんの決定②「単独で出す」）。
 * ログインは他の画面と同じく middleware.ts（Clerk）が守る（公開の道は増やしていない）。
 * 表示スイッチ NEXT_PUBLIC_SUPPORT_PLAN_A が "on" / "standalone" のときだけ開ける。今の CareNote 本番では設定しない＝404。
 */
export const metadata: Metadata = {
  title: "個別支援計画書（就労A型）の原案づくり",
};

export default function SupportPlanAPage() {
  if (supportPlanAMode(process.env.NEXT_PUBLIC_SUPPORT_PLAN_A) === "off") notFound();
  return <SupportPlanAWorkbench />;
}
