import { readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ログインの見張り（middleware.ts）。どの道をログインなしで通すかを固定する。
 *
 * なぜ必要か: 2026-10-05 吉本さんの決定で、ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open）を作った。
 *   ここを間違えると、①印の無い今の CareNote 本番でログインなしの道が開く ②試行版で CareNote の利用者・書類の道まで
 *   ログインなしで開く、のどちらも黙って起きる（画面では気づけない）。
 * Clerk の中身（セッションの確かめ方）は代役にし、「ログインしているか」を引数で渡す。道の見分け（createRouteMatcher）は本物を使う。
 */

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return { ...orig, clerkMiddleware: (handler: unknown) => handler };
});

type Handler = (
  auth: () => Promise<{ userId: string | null }>,
  req: NextRequest,
) => Promise<Response | undefined>;
const { default: middleware } = await import("@/middleware");
const run = middleware as unknown as Handler;

/** ログインしていない人（signedIn=false）／している人の頼みを通し、通したか・どこへ送ったかを返す */
/** 試行版のデプロイごとの URL の形（edition.ts の「開いてよい名前」） */
const PILOT_HOST = "carenote-abcd1234e-satoshiyoshimoto0426s-projects.vercel.app";

async function visit(path: string, signedIn = false, host = PILOT_HOST) {
  const auth = vi.fn(async () => ({ userId: signedIn ? "u1" : null }));
  const res = await run(auth, new NextRequest(`https://${host}${path}`));
  const location = res?.headers.get("location") ?? null;
  return { passed: res === undefined, location: location ? new URL(location).pathname : null };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("印が無い今の CareNote 本番", () => {
  it("ログインしていなければ、計画書の画面と3つの道もログイン画面へ送る", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    for (const p of [
      "/",
      "/support-plan-a",
      "/api/preview",
      "/api/generate",
      "/api/transcribe",
      "/clients",
    ]) {
      expect(await visit(p), p).toEqual({ passed: false, location: "/sign-in" });
    }
  });

  it("ログイン画面と拡張の道は、今までどおりログインなしで通す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "");
    for (const p of ["/sign-in", "/sign-up", "/api/extension/generate"]) {
      expect((await visit(p)).passed, p).toBe(true);
    }
  });
});

describe("ログインが要る計画書だけの版（印 on）", () => {
  it("ログインなしの道は開かない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "on");
    for (const p of ["/", "/support-plan-a", "/api/generate"]) {
      expect(await visit(p), p).toEqual({ passed: false, location: "/sign-in" });
    }
  });
});

describe("ログインなしの試行版（印 open）", () => {
  it("計画書の画面と、それが使う3つの道だけをログインなしで通す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const p of ["/", "/support-plan-a", "/api/preview", "/api/generate", "/api/transcribe"]) {
      expect((await visit(p)).passed, p).toBe(true);
    }
  });

  it("CareNote の API は、許した3つ（と拡張の道）以外すべてログインが要るまま（app/api の道を全部たどる）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    // 名指しの一覧だと、将来足した道を見落とす（独立審査 2026-10-08 小3）。app/api の route.ts から道を作る
    const apiDir = join(process.cwd(), "app", "api");
    const routes = readdirSync(apiDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(`${sep}route.ts`) || f === "route.ts")
      .map((f) => `/api/${f.split(sep).slice(0, -1).join("/")}`.replace(/\[[^\]]+\]/g, "x"));
    const allowed = new Set([
      "/api/preview",
      "/api/generate",
      "/api/transcribe",
      "/api/extension/generate",
    ]);
    const closed = routes.filter((r) => !allowed.has(r));
    expect(closed.length).toBeGreaterThan(10);
    for (const p of closed) {
      expect(await visit(p), p).toEqual({ passed: false, location: "/sign-in" });
    }
  });

  it("試行版のデプロイごとの URL でない名前（知らない別名など）でも開かない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const host of [
      "pilot.example",
      `${PILOT_HOST}.`,
      "carenote-ai-satoshiyoshimoto0426s-projects.vercel.app",
    ]) {
      expect(await visit("/api/generate", false, host), host).toEqual({
        passed: false,
        location: "/sign-in",
      });
    }
  });

  it("本番の名前（carenote-ai.vercel.app）では、印が open の版が付け替えられても開かない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const p of ["/", "/support-plan-a", "/api/preview", "/api/generate", "/api/transcribe"]) {
      expect(await visit(p, false, "carenote-ai.vercel.app"), p).toEqual({
        passed: false,
        location: "/sign-in",
      });
    }
  });

  it("似た名前の道（後ろに続きのある道）は通さない", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const p of ["/api/generate/x", "/api/preview-all", "/support-plan-a-admin"]) {
      expect((await visit(p)).passed, p).toBe(false);
    }
  });

  it("CareNote の画面へ来た人は、ログイン画面ではなく計画書の画面へ送る", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const p of ["/clients", "/create", "/evaluate", "/guide"]) {
      expect(await visit(p), p).toEqual({ passed: false, location: "/support-plan-a" });
    }
  });

  it("ログインしている人は、今までどおり通す", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    expect((await visit("/clients", true)).passed).toBe(true);
    expect((await visit("/api/clients", true)).passed).toBe(true);
  });
});
