import { hitRateLimit, type RateState } from "@/lib/extensionAuth";
import { isSupportPlanAOpen } from "./edition";

/**
 * ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open ── lib/supportPlan/edition.ts）で、
 * ログインしていない人（ゲスト）を、計画書づくりに限って受け付けるための決まりと回数の上限。
 *
 * なぜあるか: 2026-10-05 吉本さんの決定「営業の際にログインが手間 → 試行版はログインを完全になくす・AI は1日30回まで」
 *   （decisions-log）。試行版は AI の鍵と残高を CareNote 本番と共用しているので、URL が広まって知らない人に
 *   使われ続けると残高が尽き、CareNote 本番の AI も止まる（2026-09-25 に残高切れの前例）。回数の上限はその歯止め。
 * 使う所: app/api/generate/route.ts（原案づくり）・app/api/preview/route.ts（送る前の確認。AI を呼ばないので回数は数えない）・
 *   app/api/transcribe/route.ts（録音の文字起こし）。middleware.ts は open の版でこの3つの道と画面だけをログインなしで通す。
 * 限界（正直に）: 回数はサーバーの実体ごとに、温まっている間だけ数える（lib/extensionAuth.ts の hitRateLimit と同じ考え方）。
 *   実体が複数に分かれたり入れ替わったりすると数え直しになるので、「1日30回」はきっちりの上限ではなく目安の歯止め。
 *   きっちり数える必要が出たら、DB か KV に置く（§2.5-F ── 試行の規模では作らない）。
 */

/** 原案づくり（AI）の1日の上限（日本時間の0時で数え直す）。吉本さんの決定 2026-10-05 */
export const GUEST_PLAN_DAILY_LIMIT = 30;
/** 原案づくりの、同じ IP アドレスからの1時間の上限（1人に1日分を使い切られないため） */
export const GUEST_PLAN_HOURLY_PER_IP = 10;
/**
 * 録音の文字起こし（5分ごとの区切り1つ＝1回）の1日の上限。原案1件の面談（約60分＝12回）を20件ぶん。
 * 1時間・1つの IP アドレスあたりの上限は、ログインしている人と同じ TRANSCRIBE_RATE_LIMIT（lib/transcribe/validate.ts）を使う。
 */
export const GUEST_TRANSCRIBE_DAILY_LIMIT = 240;

const HOUR_MS = 60 * 60 * 1000;

/** 日本時間の日付（YYYY-MM-DD）。1日の上限の数え直しに使う */
export function tokyoDay(now: number): string {
  return new Date(now + 9 * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * 頼んできた人の IP アドレス。Vercel は x-forwarded-for を自分で上書きし、外から偽れない
 * （https://vercel.com/docs/headers/request-headers「we currently overwrite the X-Forwarded-For header」2026-10-05 確認）。
 * 取れなければ "unknown"（その場合は全員が1つの枠を分け合う＝きつい側に倒れる）。
 */
export function clientIpOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * ログインしていない人の頼みを、試行版の計画書づくりとして受け付けてよいか。
 * 印が open で、ログインしておらず、書類の種類が計画書（"supportPlanA"）のときだけ true。
 * CareNote の書類（支援経過・ケアプランなど）は、試行版でもログインが要る。
 */
export function isGuestPlanRequest(
  userId: string | null | undefined,
  documentType: unknown,
  open: boolean = isSupportPlanAOpen(),
): boolean {
  return open && !userId && documentType === "supportPlanA";
}

/** ゲストの回数の置き場（ルートごとに1つ持つ。サーバーの実体ごとの記憶） */
export interface GuestQuotaStore {
  daily: { day: string; used: number };
  perIp: Map<string, RateState>;
}

export function newGuestQuotaStore(): GuestQuotaStore {
  return { daily: { day: "", used: 0 }, perIp: new Map() };
}

export interface GuestQuotaLimits {
  daily: number;
  perIpHourly: number;
  /** 画面に出す言葉（例「原案づくり」「文字起こし」） */
  label: string;
}

/**
 * ゲストの1回を数える。上限に届いていれば数えずに、画面にそのまま出せる日本語の文を返す。
 * 呼ぶのは**外（AI）へ送る直前**（形の誤りなどで弾いたものを数えない ── transcribe と同じ決まり）。
 */
export function takeGuestTurn(
  store: GuestQuotaStore,
  ip: string,
  now: number,
  limits: GuestQuotaLimits,
): { ok: true } | { ok: false; error: string } {
  const day = tokyoDay(now);
  if (store.daily.day !== day) store.daily = { day, used: 0 };
  if (store.daily.used >= limits.daily) {
    return {
      ok: false,
      error: `今日の試行で使える${limits.label}の回数（${limits.daily}回）に達しました。明日（日本時間の0時より後）にもう一度お試しください。`,
    };
  }
  const rate = hitRateLimit(store.perIp, ip, now, {
    limit: limits.perIpHourly,
    windowMs: HOUR_MS,
  });
  if (rate.limited) {
    return {
      ok: false,
      error: `短い時間に続けて${limits.label}が使われたため、少し止めています。1時間ほど空けてから、もう一度お試しください。`,
    };
  }
  store.daily.used += 1;
  return { ok: true };
}

/**
 * 数えた1回を戻す。AI を呼ぶ前に、頼みの中身の誤り（長すぎる・欄が無い）で止まったときだけ使う
 * （AI の費用がかかっていない分で、その日の枠を減らさないため）。同じ IP の1時間の枠は戻さない。
 */
export function releaseGuestTurn(store: GuestQuotaStore, now: number): void {
  if (store.daily.day === tokyoDay(now) && store.daily.used > 0) store.daily.used -= 1;
}
