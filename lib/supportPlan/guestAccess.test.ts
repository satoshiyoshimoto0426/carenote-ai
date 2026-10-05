import { describe, expect, it } from "vitest";
import {
  clientIpOf,
  GUEST_PLAN_DAILY_LIMIT,
  GUEST_PLAN_HOURLY_PER_IP,
  isGuestPlanRequest,
  newGuestQuotaStore,
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
