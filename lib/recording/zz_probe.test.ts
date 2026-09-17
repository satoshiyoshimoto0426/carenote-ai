import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MAX_CONSECUTIVE_FAILURES } from "./config";
import { initialQueue, nextWaiting, type QueueAction, reduceQueue } from "./segments";

const run = (a: QueueAction[], from = initialQueue) => a.reduce(reduceQueue, from);
const add = (n: number): QueueAction[] =>
  Array.from({ length: n }, () => ({ type: "add", bytes: 1000 }) as QueueAction);

describe("PROBE: 停止条件の意味", () => {
  it("PROBE-A: たった1本の区切りが一時的な失敗を3回しただけで録音停止フラグが立つ", () => {
    let s = run(add(5));
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      s = run(
        [
          { type: "sending", index: 1 },
          { type: "failed", index: 1, error: "混み合っています(429)", permanent: false },
        ],
        s,
      );
    }
    console.log("PROBE-A consecutiveFailures=", s.consecutiveFailures);
    console.log("PROBE-A stopped=", s.stopped);
    console.log("PROBE-A gaveUp本数=", s.segments.filter((x) => x.status === "gaveUp").length);
    console.log("PROBE-A nextWaiting=", nextWaiting(s));
    expect(s.stopped).not.toBeNull();
    expect(s.segments.filter((x) => x.status === "gaveUp").length).toBe(1);
  });

  it("PROBE-B: MAX_ATTEMPTS と MAX_CONSECUTIVE_FAILURES が等しい＝2本目に到達不能", () => {
    console.log("MAX_ATTEMPTS=", MAX_ATTEMPTS, "MAX_CONSECUTIVE_FAILURES=", MAX_CONSECUTIVE_FAILURES);
    expect(MAX_ATTEMPTS).toBe(MAX_CONSECUTIVE_FAILURES);
  });

  it("PROBE-C: 止まったあとも add は通り、待ち行列に音声が積み増される（送られないまま残る）", () => {
    let s = run(add(1));
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      s = run(
        [
          { type: "sending", index: 1 },
          { type: "failed", index: 1, error: "つながりません", permanent: false },
        ],
        s,
      );
    }
    s = run(add(10), s); // 録音が続けば closeSegment が add を呼び続ける
    console.log("PROBE-C stopped=", s.stopped);
    console.log("PROBE-C segments=", s.segments.length, "waiting=", s.segments.filter((x) => x.status === "waiting").length);
    console.log("PROBE-C nextWaiting=", nextWaiting(s));
    expect(s.segments.filter((x) => x.status === "waiting").length).toBe(10);
    expect(nextWaiting(s)).toBeNull();
  });
});
