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
async function visit(path: string, signedIn = false) {
  const auth = vi.fn(async () => ({ userId: signedIn ? "u1" : null }));
  const res = await run(auth, new NextRequest(`https://pilot.example${path}`));
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

  it("CareNote の利用者・書類の道はログインが要るまま（ログイン画面へ送る）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_PLAN_A", "open");
    for (const p of [
      "/api/clients",
      "/api/clients/aliases",
      "/api/documents",
      "/api/transcripts",
      "/api/evaluate",
      "/api/rescue",
      "/api/blob-upload",
      "/api/history",
    ]) {
      expect(await visit(p), p).toEqual({ passed: false, location: "/sign-in" });
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
