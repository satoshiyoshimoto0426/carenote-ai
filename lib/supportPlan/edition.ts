/**
 * 就労A型の個別支援計画書を単独で公開する版（エディション）かどうかを決める、ビルド時の環境の印。
 *
 * なぜあるか: 2026-10-03 吉本さんの決定②「今の CareNote AI のメニューには足さず、単独で出す」。
 *   同じプログラムを、印 NEXT_PUBLIC_SUPPORT_PLAN_A を付けて**別の URL**に公開する。
 *   試行（2026-10-04〜）は同じ Vercel プロジェクトの別のデプロイ（`vercel deploy --prod --skip-domain -b …`）で、
 *   ログイン・DB・AI の鍵は CareNote 本番と共用（decisions-log 2026-10-04）。
 *   印が無い今の本番（carenote-ai.vercel.app）では、計画書の画面は 404 のまま・CareNote の画面は今までどおり。
 * 印の値は3つ（それ以外 ── 未設定・"ON"・"true"・空白つきなどの打ち間違い ── はすべて off）:
 *   - "on"（前の名前 "standalone" も同じ意味）… 計画書の画面だけの版。ログインは CareNote と同じ Clerk が要る
 *   - "open" … 上と同じ画面を**ログインなし**で使える試行版（2026-10-05 吉本さんの決定「営業の際に手間」・decisions-log）。
 *     ログインしていない人に開くのは計画書の画面と、それが使う3つの道（/api/preview・/api/generate の
 *     documentType "supportPlanA"・/api/transcribe）だけ。AI の回数は lib/supportPlan/guestAccess.ts が1日30回までに絞る。
 * 印が on / open の版でしていること（docs/specs/support-plan-a/README.md「公開の仕方」）:
 *   - app/support-plan-a/page.tsx … 計画書の画面を開ける（off なら notFound）
 *   - app/page.tsx … 「/」を計画書の画面へ送る
 *   - app/(dashboard)/layout.tsx … CareNote の画面（利用者・つくる・点検・使い方）に入ったら計画書の画面へ送る
 *   - middleware.ts … open のときだけ、上の画面と3つの道をログインなしで通す（それ以外は今までどおりログインが要る）
 * NEXT_PUBLIC_ の値は Next.js がビルドの時に埋め込む。process.env.NEXT_PUBLIC_SUPPORT_PLAN_A と字のまま書くこと
 *   （分解・別名にすると埋め込まれず、ブラウザ側で常に off になる）。
 */

/** 計画書の画面の道（URL）。振り分けの行き先と、画面の置き場所 app/support-plan-a/ はこれに合わせる */
export const SUPPORT_PLAN_A_PATH = "/support-plan-a";

/** 印の読み方: off＝今の CareNote／login＝計画書だけ・ログインあり／open＝計画書だけ・ログインなし */
export type SupportPlanAMode = "off" | "login" | "open";

/**
 * 印の値（文字）を読み、どの版かを返す。迷ったら off（今の CareNote のまま）に倒す。
 * 引数を省くと、ビルド時に埋め込まれた NEXT_PUBLIC_SUPPORT_PLAN_A を読む（試験では値を渡すか vi.stubEnv で変える）。
 */
export function supportPlanAMode(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): SupportPlanAMode {
  if (value === "open") return "open";
  if (value === "on" || value === "standalone") return "login";
  return "off";
}

/** 計画書を単独で公開する版（ログインの有無は問わない）なら true */
export function isSupportPlanAEdition(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  return supportPlanAMode(value) !== "off";
}

/** ログインなしで使える試行版（印 "open"）なら true。middleware.ts と3つの道が見る */
export function isSupportPlanAOpen(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  return supportPlanAMode(value) === "open";
}
