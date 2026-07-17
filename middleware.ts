import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    const { userId } = await auth();
    if (!userId) {
      const signInUrl = new URL("/sign-in", req.url);
      signInUrl.searchParams.set("redirect_url", req.url);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
