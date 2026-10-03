/**
 * 就労A型の個別支援計画書を単独で公開する版（エディション）かどうかを決める、ビルド時の環境の印。
 *
 * なぜあるか: 2026-10-03 吉本さんの決定②「今の CareNote AI のメニューには足さず、単独で出す」。
 *   同じプログラムを、印 NEXT_PUBLIC_SUPPORT_PLAN_A=on を付けて**別の URL**（別の Vercel のプロジェクト）に公開する。
 *   印が無い今の本番（carenote-ai.vercel.app）では、計画書の画面は 404 のまま・CareNote の画面は今までどおり。
 * 印が on の版でしていること（docs/specs/support-plan-a/README.md「公開の仕方」）:
 *   - app/support-plan-a/page.tsx … 計画書の画面を開ける（off なら notFound）
 *   - app/page.tsx … 「/」を計画書の画面へ送る
 *   - app/(dashboard)/layout.tsx … CareNote の画面（利用者・つくる・点検・使い方）に入ったら計画書の画面へ送る
 *   ログインの見張り（middleware.ts）は変えない ── どちらの版でも同じ Clerk のログインが要る。
 * 値の決まり: "on" のほかに "standalone" も同じ意味として受け付ける（段階2の最初の版がこの名前で書いていたため。
 *   すでにどこかで設定していても壊さない）。それ以外（未設定・"ON"・"true" などの打ち間違い）は off。
 * NEXT_PUBLIC_ の値は Next.js がビルドの時に埋め込む。process.env.NEXT_PUBLIC_SUPPORT_PLAN_A と字のまま書くこと
 *   （分解・別名にすると埋め込まれず、ブラウザ側で常に off になる）。
 */

/** 計画書の画面の道（URL）。振り分けの行き先と、画面の置き場所 app/support-plan-a/ はこれに合わせる */
export const SUPPORT_PLAN_A_PATH = "/support-plan-a";

/**
 * 印の値（文字）を読み、計画書を単独で公開する版なら true。
 * 引数を省くと、ビルド時に埋め込まれた NEXT_PUBLIC_SUPPORT_PLAN_A を読む（試験では値を渡すか vi.stubEnv で変える）。
 */
export function isSupportPlanAEdition(
  value: string | undefined = process.env.NEXT_PUBLIC_SUPPORT_PLAN_A,
): boolean {
  return value === "on" || value === "standalone";
}
