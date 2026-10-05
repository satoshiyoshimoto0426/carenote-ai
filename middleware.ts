import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { isSupportPlanAOpen, SUPPORT_PLAN_A_PATH } from "@/lib/supportPlan/edition";

// 拡張API（generate のみ）は Clerk セッションを持たない拡張が叩くため公開扱いにし、
// ルート内の Bearer トークン認証（lib/extensionAuth）で守る。これを外すと Clerk が
// 307 リダイレクトで横取りし、拡張から到達不能になる（G3 で判明した潜在バグ）。
// ※ ワイルドカード（/api/extension/(.*)）は避け、実在パスだけを公開する。拡張ルートを
//    増やす場合は、各ルートが自前の Bearer 認可を持つことを確認してからここへ追加する。
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/extension/generate",
]);

// ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open ── lib/supportPlan/edition.ts・2026-10-05 吉本さんの決定）だけで
// ログインなしに通す道。計画書の画面と、それが使う3つの道に限る（ワイルドカードにしない）。
// 3つの道は、ログインしていない人を中で絞る（計画書づくりだけ・回数の上限 ── lib/supportPlan/guestAccess.ts）。
// 印の無い今の CareNote 本番では、この一覧は使われない（isSupportPlanAOpen() はビルド時に false で埋め込まれる）。
const isOpenPilotRoute = createRouteMatcher([
  "/",
  SUPPORT_PLAN_A_PATH,
  "/api/preview",
  "/api/generate",
  "/api/transcribe",
]);
const isApiRoute = createRouteMatcher(["/api/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  const open = isSupportPlanAOpen();
  if (open && isOpenPilotRoute(req)) return;
  const { userId } = await auth();
  if (!userId) {
    // 試行版では CareNote の画面へ来ても、ログイン画面ではなく計画書の画面へ送る（ログインの無い版で迷わせない）
    if (open && !isApiRoute(req)) {
      return NextResponse.redirect(new URL(SUPPORT_PLAN_A_PATH, req.url));
    }
    const signInUrl = new URL("/sign-in", req.url);
    signInUrl.searchParams.set("redirect_url", req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
