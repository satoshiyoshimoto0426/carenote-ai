import { hitRateLimit, type RateState } from "@/lib/extensionAuth";
import { estimateBytes, SEGMENT_MAX_BYTES, SEGMENT_MAX_MS } from "@/lib/recording/config";

/**
 * ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open ── lib/supportPlan/edition.ts）で、
 * ログインしていない人（ゲスト）を、計画書づくりに限って受け付けるための決まりと回数の上限。
 *
 * なぜあるか: 2026-10-05 吉本さんの決定「営業の際にログインが手間 → 試行版はログインを完全になくす・AI は1日30回まで」
 *   （decisions-log）。試行版は AI の鍵と残高を CareNote 本番と共用しているので、URL が広まって知らない人に
 *   使われ続けると残高が尽き、CareNote 本番の AI も止まる（2026-09-25 に残高切れの前例）。回数の上限はその歯止め。
 * 使う所: app/api/generate/route.ts（原案づくり）・app/api/preview/route.ts（送る前の確認。AI を呼ばないので回数は数えない）・
 *   app/api/transcribe/route.ts（録音の文字起こし）。middleware.ts は open の版でこの3つの道と画面だけをログインなしで通す。
 *   ログインなしで開いてよい名前かどうか（本番の名前では開かない）は edition.ts の isOpenPilotAt。
 * 限界（正直に）: 回数はサーバーの実体ごとに、温まっている間だけ数える（lib/extensionAuth.ts の hitRateLimit と同じ考え方）。
 *   実体が複数に分かれたり入れ替わったりすると数え直しになるので、「1日30回」はきっちりの上限ではなく目安の歯止め。
 *   意図して攻める人を確実に止められるのは、AI 会社側の利用額の上限だけ。きっちり数える必要が出たら DB か KV に置く
 *   （§2.5-F ── 試行の規模では作らない）。
 */

/** 原案づくり（AI）の1日の上限（日本時間の0時で数え直す）。吉本さんの決定 2026-10-05 */
export const GUEST_PLAN_DAILY_LIMIT = 30;
/** 原案づくりの、同じ IP アドレスからの1時間の上限（1人に1日分を使い切られないため） */
export const GUEST_PLAN_HOURLY_PER_IP = 10;
/**
 * ゲストの文字起こしで、1回に受け付ける音声の大きさの上限。画面の録音は5分か3MBで区切るので（lib/recording/config.ts）、
 * 画面から来る区切りはこれを超えない。ログインしている人の上限（4MB）より小さくし、1回で長い音声を外へ出させない
 * （独立審査 2026-10-08 中1）。
 */
export const GUEST_AUDIO_MAX_BYTES = SEGMENT_MAX_BYTES;
/**
 * ゲストの文字起こしの1日の上限を、回数ではなく**音声の大きさの合計**で数える（独立審査 2026-10-08 中1:
 * 回数だけだと、1回を大きくすれば想定の何倍も外へ送れた）。5分の区切り240本ぶん（32kbps の見込みで約20時間・約288MB）。
 */
export const GUEST_TRANSCRIBE_DAILY_BYTES = 240 * estimateBytes(SEGMENT_MAX_MS);

const HOUR_MS = 60 * 60 * 1000;

/** 日本時間の日付（YYYY-MM-DD）。1日の上限の数え直しに使う */
export function tokyoDay(now: number): string {
  return new Date(now + 9 * HOUR_MS).toISOString().slice(0, 10);
}

/**
 * IPv6 の住所を、前の64ビット（家や事業所に配られる1区画）にまとめる。IPv6 の利用者は区画の中で住所を
 * 自由に変えられるので、そのまま数えると「同じ IP から1時間」の上限が効かない（独立審査 2026-10-08 小4）。
 * IPv4 や読めない形は、そのまま返す。
 */
export function ipv6Prefix(ip: string): string {
  if (!ip.includes(":")) return ip;
  const parts = ip.split("::");
  if (parts.length > 2) return ip;
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0 || (parts.length === 1 && left.length !== 8)) return ip;
  const groups = [...left, ...Array<string>(fill).fill("0"), ...right];
  const head = groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""));
  return `${head.join(":")}::/64`;
}

/**
 * 頼んできた人の IP アドレス（IPv6 は前の64ビット）。Vercel は x-forwarded-for を自分で上書きし、外から偽れない
 * （https://vercel.com/docs/headers/request-headers「we currently overwrite the X-Forwarded-For header」2026-10-05 確認）。
 * 取れなければ "unknown"（その場合は全員が1つの枠を分け合う＝きつい側に倒れる）。
 */
export function clientIpOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return ipv6Prefix(ip);
}

/**
 * ゲストの頼みが「試行版の画面そのもの」から来たものか。別のサイトに来た人のブラウザに頼みを送らせると、
 * その人の IP で数えられて「同じ IP から1時間」の上限をすり抜けられる（独立審査 2026-10-08 中2）。
 * ブラウザは別のサイトからの頼みに Origin と Sec-Fetch-Site を付けるので、それが自分と違えば断る。
 * 両方とも無い頼み（curl など、ブラウザではないもの）は通す ── その場合は送り主自身の IP で数えられる。
 * 原案づくりと送る前の確認は JSON で送る決まりで、別のサイトのページは JSON を（事前の確かめなしに）送れないので、
 * content-type も確かめる（expect "json"）。文字起こしは音声のファイルなので確かめない（expect "form"）。
 * 返すのは断るときの { status, error }（画面にそのまま出せる日本語）。問題が無ければ null。
 */
export function guestRequestProblem(
  headers: Headers,
  expect: "json" | "form",
): { status: number; error: string } | null {
  const site = headers.get("sec-fetch-site");
  const origin = headers.get("origin");
  let originHost: string | null = null;
  if (origin) {
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = "";
    }
  }
  const crossSite =
    (site !== null && site !== "same-origin") ||
    (originHost !== null && originHost !== headers.get("host"));
  if (crossSite) {
    return {
      status: 403,
      error: "この画面の外からは使えません。試行版の画面から操作してください。",
    };
  }
  if (
    expect === "json" &&
    !headers.get("content-type")?.toLowerCase().includes("application/json")
  ) {
    return { status: 415, error: "送り方が正しくありません。試行版の画面から操作してください。" };
  }
  return null;
}

/**
 * ログインしていない人の頼みを、試行版の計画書づくりとして受け付けてよいか。
 * open（印が open で、本番の名前ではない ── edition.ts の isOpenPilotAt）で、ログインしておらず、
 * 書類の種類が計画書（"supportPlanA"）のときだけ true。CareNote の書類（支援経過・ケアプランなど）は、試行版でもログインが要る。
 */
export function isGuestPlanRequest(
  userId: string | null | undefined,
  documentType: unknown,
  open: boolean,
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
  /** 1日の枠（原案づくりは回数、文字起こしは音声のバイト数の合計） */
  daily: number;
  /** 同じ IP（IPv6 は前の64ビット）からの1時間の回数の上限 */
  perIpHourly: number;
  /** 画面に出す言葉（例「原案づくり」「文字起こし」） */
  label: string;
  /** 1日の枠を画面に出す言い方（例「30回」「約20時間分」） */
  dailyText: string;
}

/**
 * ゲストの1回を数える（weight＝その回が1日の枠から使う量。原案づくりは1、文字起こしは音声のバイト数）。
 * 上限に届いていれば数えずに、画面にそのまま出せる日本語の文を返す。
 * 呼ぶのは**外（AI）へ送る直前**（形の誤りなどで弾いたものを数えない ── transcribe と同じ決まり）。
 */
export function takeGuestTurn(
  store: GuestQuotaStore,
  ip: string,
  now: number,
  limits: GuestQuotaLimits,
  weight = 1,
): { ok: true } | { ok: false; error: string } {
  const day = tokyoDay(now);
  if (store.daily.day !== day) store.daily = { day, used: 0 };
  if (store.daily.used + weight > limits.daily) {
    return {
      ok: false,
      error: `今日の試行で使える${limits.label}の上限（${limits.dailyText}）に達しました。明日（日本時間の0時より後）にもう一度お試しください。`,
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
  store.daily.used += weight;
  return { ok: true };
}

/**
 * 数えた1回を戻す。AI を呼ぶ前に、頼みの中身の誤り（長すぎる・欄が無い）で止まったときだけ使う
 * （AI の費用がかかっていない分で、その日の枠を減らさないため）。同じ IP の1時間の枠は戻さない。
 * AI を呼んだあとの失敗（500・402）では戻さない（費用がかかっている・試験で固定）。
 */
export function releaseGuestTurn(store: GuestQuotaStore, now: number, weight = 1): void {
  if (store.daily.day !== tokyoDay(now)) return;
  store.daily.used = Math.max(0, store.daily.used - weight);
}
