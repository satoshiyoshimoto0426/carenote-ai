import { describe, expect, it } from "vitest";
import {
  clientIpOf,
  GUEST_AUDIO_MAX_BYTES,
  GUEST_PLAN_DAILY_LIMIT,
  GUEST_PLAN_HOURLY_PER_IP,
  GUEST_TRANSCRIBE_DAILY_BYTES,
  guestRequestProblem,
  ipv6Prefix,
  isGuestPlanRequest,
  newGuestQuotaStore,
  pickGuestPlanFields,
  releaseGuestTurn,
  takeGuestTurn,
  tokyoDay,
} from "./guestAccess";

/**
 * ログインなしの試行版（印 "open"）で、ログインしていない人を受け付ける決まりと回数の上限。
 * 守ること: ①計画書づくり以外はログインが要るまま ②AI の回数は1日の上限で止まる（残高を使い切られて
 *   CareNote 本番の AI まで止まらないため・2026-10-05 吉本さんの決定「1日30回」）③同じ IP の連打も止まる
 *   ④日本時間の0時で数え直す ⑤AI を呼ぶ前に止まった分は戻す。
 */

const LIMITS = {
  daily: GUEST_PLAN_DAILY_LIMIT,
  perIpHourly: GUEST_PLAN_HOURLY_PER_IP,
  label: "原案づくり",
  dailyText: `${GUEST_PLAN_DAILY_LIMIT}回`,
};
const NOON_JST = Date.parse("2026-10-05T03:00:00Z");

describe("ゲストを受け付けるか", () => {
  it("試行版（open）で、ログインしておらず、計画書づくりのときだけ受け付ける", () => {
    expect(isGuestPlanRequest(null, "supportPlanA", true)).toBe(true);
    expect(isGuestPlanRequest(undefined, "supportPlanA", true)).toBe(true);
  });

  it("CareNote の書類は、試行版でもログインが要る", () => {
    for (const t of ["supportLog", "carePlan", "assessment", undefined, "", "supportplana"]) {
      expect(isGuestPlanRequest(null, t, true)).toBe(false);
    }
  });

  it("印が open でなければ、ログインしていない人は受け付けない", () => {
    expect(isGuestPlanRequest(null, "supportPlanA", false)).toBe(false);
  });

  it("ログインしている人はゲストとして数えない（いつもどおりの道を通る）", () => {
    expect(isGuestPlanRequest("u1", "supportPlanA", true)).toBe(false);
  });
});

describe("回数の上限", () => {
  it("1日の上限に届いたら止め、日本語の理由を返す", () => {
    const store = newGuestQuotaStore();
    for (let i = 0; i < GUEST_PLAN_DAILY_LIMIT; i++) {
      // IP を変えて、同じ IP の上限に先に当たらないようにする
      expect(takeGuestTurn(store, `10.0.0.${i}`, NOON_JST, LIMITS).ok).toBe(true);
    }
    const over = takeGuestTurn(store, "10.0.1.1", NOON_JST, LIMITS);
    expect(over.ok).toBe(false);
    expect(over.ok ? "" : over.error).toContain(`${GUEST_PLAN_DAILY_LIMIT}回`);
    expect(over.ok ? "" : over.error).toContain("明日");
  });

  it("同じ IP からは1時間の上限で止める（1人に1日分を使い切られない）", () => {
    const store = newGuestQuotaStore();
    for (let i = 0; i < GUEST_PLAN_HOURLY_PER_IP; i++) {
      expect(takeGuestTurn(store, "10.0.0.1", NOON_JST + i, LIMITS).ok).toBe(true);
    }
    const over = takeGuestTurn(store, "10.0.0.1", NOON_JST + 100, LIMITS);
    expect(over.ok).toBe(false);
    expect(over.ok ? "" : over.error).toContain("1時間");
    // 隣の人（別の IP）は使える
    expect(takeGuestTurn(store, "10.0.0.2", NOON_JST + 100, LIMITS).ok).toBe(true);
    // 同じ IP でも1時間たてば使える
    expect(takeGuestTurn(store, "10.0.0.1", NOON_JST + 60 * 60 * 1000 + 1, LIMITS).ok).toBe(true);
  });

  it("止めた頼みは1日の回数に数えない", () => {
    const store = newGuestQuotaStore();
    for (let i = 0; i < GUEST_PLAN_HOURLY_PER_IP + 5; i++) {
      takeGuestTurn(store, "10.0.0.1", NOON_JST + i, LIMITS);
    }
    expect(store.daily.used).toBe(GUEST_PLAN_HOURLY_PER_IP);
  });

  it("日本時間の0時で数え直す（世界標準時の0時ではない）", () => {
    const store = newGuestQuotaStore();
    const beforeMidnightJst = Date.parse("2026-10-05T14:59:00Z"); // 日本時間 23:59
    const afterMidnightJst = Date.parse("2026-10-05T15:01:00Z"); // 日本時間 翌 0:01
    for (let i = 0; i < GUEST_PLAN_DAILY_LIMIT; i++) {
      takeGuestTurn(store, `10.0.0.${i}`, beforeMidnightJst, LIMITS);
    }
    expect(takeGuestTurn(store, "10.0.9.9", beforeMidnightJst, LIMITS).ok).toBe(false);
    expect(takeGuestTurn(store, "10.0.9.9", afterMidnightJst, LIMITS).ok).toBe(true);
    expect(tokyoDay(beforeMidnightJst)).toBe("2026-10-05");
    expect(tokyoDay(afterMidnightJst)).toBe("2026-10-06");
  });

  it("AI を呼ぶ前に止まった1回は戻す（0 より下には戻さない・前の日の分は戻さない）", () => {
    const store = newGuestQuotaStore();
    takeGuestTurn(store, "10.0.0.1", NOON_JST, LIMITS);
    releaseGuestTurn(store, NOON_JST);
    expect(store.daily.used).toBe(0);
    releaseGuestTurn(store, NOON_JST);
    expect(store.daily.used).toBe(0);
    takeGuestTurn(store, "10.0.0.1", NOON_JST, LIMITS);
    releaseGuestTurn(store, NOON_JST + 24 * 60 * 60 * 1000);
    expect(store.daily.used).toBe(1);
  });
});

describe("頼んできた人の IP アドレス", () => {
  it("x-forwarded-for の先頭を使う（Vercel が上書きする値）", () => {
    const h = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(clientIpOf(h)).toBe("203.0.113.5");
  });

  it("無ければ x-real-ip、どちらも無ければ unknown（全員で1つの枠＝きつい側）", () => {
    expect(clientIpOf(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIpOf(new Headers())).toBe("unknown");
  });
});

describe("重さのある数え方（文字起こしは音声の大きさの合計で数える）", () => {
  const AUDIO = { daily: 10_000, perIpHourly: 100, label: "文字起こし", dailyText: "約20時間分" };

  it("1日の枠を超える1回は、数えずに止める（枠の手前まで使ったあとの大きな1回もすり抜けない）", () => {
    const store = newGuestQuotaStore();
    expect(takeGuestTurn(store, "10.0.0.1", NOON_JST, AUDIO, 6_000).ok).toBe(true);
    const over = takeGuestTurn(store, "10.0.0.2", NOON_JST, AUDIO, 5_000);
    expect(over.ok).toBe(false);
    expect(over.ok ? "" : over.error).toContain("約20時間分");
    expect(store.daily.used).toBe(6_000);
    expect(takeGuestTurn(store, "10.0.0.2", NOON_JST, AUDIO, 4_000).ok).toBe(true);
  });

  it("戻すときも重さぶん戻し、0 より下にはしない", () => {
    const store = newGuestQuotaStore();
    takeGuestTurn(store, "10.0.0.1", NOON_JST, AUDIO, 300);
    releaseGuestTurn(store, NOON_JST, 1_000);
    expect(store.daily.used).toBe(0);
  });

  it("1回の音声の上限は画面の録音の1区切りの大きさで、1日の枠はその区切りの何十本ぶんもある", () => {
    expect(GUEST_AUDIO_MAX_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(GUEST_TRANSCRIBE_DAILY_BYTES / GUEST_AUDIO_MAX_BYTES).toBeGreaterThan(50);
  });
});

describe("IPv6 は前の64ビットで数える（区画の中で住所を変えても同じ人）", () => {
  it("省略の無い形・省略のある形の両方を、前の4つの区切りにまとめる", () => {
    expect(ipv6Prefix("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe("2001:db8:1:2::/64");
    expect(ipv6Prefix("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(ipv6Prefix("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(ipv6Prefix("::1")).toBe("0:0:0:0::/64");
  });

  it("同じ区画の別の住所は、同じ数え先になる", () => {
    const a = clientIpOf(new Headers({ "x-forwarded-for": "2001:db8:1:2::aaaa" }));
    const b = clientIpOf(new Headers({ "x-forwarded-for": "2001:db8:1:2:ffff:1:2:3" }));
    expect(a).toBe(b);
  });

  it("IPv4 と読めない形は、そのまま", () => {
    expect(ipv6Prefix("203.0.113.5")).toBe("203.0.113.5");
    expect(ipv6Prefix("1:2:3")).toBe("1:2:3");
    expect(ipv6Prefix("1::2::3")).toBe("1::2::3");
  });
});

describe("ゲストの頼みは、試行版の画面そのものからだけ受け付ける（別のサイトに使わせない）", () => {
  const same = { host: "pilot.example", "content-type": "application/json" };

  it("同じ画面からの JSON の頼みは通す（Origin・Sec-Fetch-Site が自分と同じ）", () => {
    const h = new Headers({
      ...same,
      origin: "https://pilot.example",
      "sec-fetch-site": "same-origin",
    });
    expect(guestRequestProblem(h, "json")).toBeNull();
  });

  it("ブラウザではない頼み（Origin も Sec-Fetch-Site も無い）は通す ── 送り主自身の IP で数えられる", () => {
    expect(guestRequestProblem(new Headers(same), "json")).toBeNull();
  });

  it("別のサイトからの頼みは 403（Origin が違う・Sec-Fetch-Site が cross-site・読めない Origin）", () => {
    const crossSites: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      { origin: "null" },
    ];
    for (const extra of crossSites) {
      expect(guestRequestProblem(new Headers({ ...same, ...extra }), "json")?.status).toBe(403);
    }
  });

  it("JSON ではない頼みは 415（別のサイトのページが確かめなしに送れる形を断る）。音声のファイルは確かめない", () => {
    const text = new Headers({ host: "pilot.example", "content-type": "text/plain" });
    expect(guestRequestProblem(text, "json")?.status).toBe(415);
    const form = new Headers({
      host: "pilot.example",
      "content-type": "multipart/form-data; boundary=x",
    });
    expect(guestRequestProblem(form, "form")).toBeNull();
  });
});

describe("再審査（2026-10-08）の小さな直し", () => {
  it("content-type は「;」より前の完全一致で見る（text/plain; x=application/json は 415）", () => {
    const h = new Headers({
      host: "pilot.example",
      "content-type": "text/plain; x=application/json",
    });
    expect(guestRequestProblem(h, "json")?.status).toBe(415);
    const ok = new Headers({
      host: "pilot.example",
      "content-type": "Application/JSON; charset=utf-8",
    });
    expect(guestRequestProblem(ok, "json")).toBeNull();
  });

  it("IPv4 を埋め込んだ IPv6（::ffff:a.b.c.d）は、その IPv4 として数える（全員が1つにまとまらない）", () => {
    expect(ipv6Prefix("::ffff:203.0.113.5")).toBe("203.0.113.5");
    expect(ipv6Prefix("::FFFF:198.51.100.7")).toBe("198.51.100.7");
  });

  it("ゲストの本文からは、使う欄だけを取り出す（無い欄は足さない）", () => {
    expect(
      pickGuestPlanFields({ documentType: "supportPlanA", interviewNotes: "x", junk: "y", f1: "" }),
    ).toEqual({ documentType: "supportPlanA", interviewNotes: "x" });
  });

  it("ゲストの1回の音声の上限は、区切りの3MBに余裕を足したもので、ログインした人の4MBより小さい", () => {
    expect(GUEST_AUDIO_MAX_BYTES).toBeGreaterThan(3 * 1024 * 1024);
    expect(GUEST_AUDIO_MAX_BYTES).toBeLessThan(4 * 1024 * 1024);
  });
});
