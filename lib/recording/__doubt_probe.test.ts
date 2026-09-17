import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MAX_CONSECUTIVE_FAILURES } from "./config";
import { initialQueue, nextWaiting, progress, type QueueAction, type QueueState, reduceQueue } from "./segments";

const run = (a: QueueAction[], from: QueueState = initialQueue): QueueState => a.reduce(reduceQueue, from);
const add = (n: number): QueueAction[] => Array.from({ length: n }, () => ({ type: "add", bytes: 1000 }) as QueueAction);

describe("DOUBT probe", () => {
  it("P1: 1本の区切りが3回やり直して諦めただけで、録音全体が止まる", () => {
    let s = run(add(12)); // 60分の会議 = 12本
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      s = run([{ type: "sending", index: 1 }, { type: "failed", index: 1, error: "混み合っています", permanent: false }], s);
    }
    console.log("MAX_ATTEMPTS=", MAX_ATTEMPTS, "MAX_CONSECUTIVE_FAILURES=", MAX_CONSECUTIVE_FAILURES);
    console.log("consecutiveFailures=", s.consecutiveFailures);
    console.log("stopped=", JSON.stringify(s.stopped));
    console.log("seg1.status=", s.segments[0].status, "seg2.status=", s.segments[1].status);
    console.log("nextWaiting=", nextWaiting(s));
    console.log("progress=", JSON.stringify(progress(s)));
    expect(s.stopped).not.toBeNull();       // ← 1本しか落ちていないのに止まる
    expect(nextWaiting(s)).toBeNull();       // ← 残り11本は永久に送られない
    expect(progress(s).pending).toBe(11);
  });

  it("P2: 止まったあと、残りの区切りは done にも gaveUp にもならない（永久 pending）", () => {
    let s = run(add(12));
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      s = run([{ type: "sending", index: 1 }, { type: "failed", index: 1, error: "混み合っています", permanent: false }], s);
    }
    s = run(add(3), s); // 録音は止まらないので区切りは増え続ける
    console.log("after stop, total=", progress(s).total, "pending=", progress(s).pending, "gaveUp=", progress(s).gaveUp);
    expect(progress(s).pending).toBe(14);
  });

  it("P3: 2本が交互に1回ずつ失敗しても、間に成功が無ければ止まる境界を確認", () => {
    let s = run(add(5));
    s = run([{ type: "sending", index: 1 }, { type: "failed", index: 1, error: "e", permanent: false }], s);
    s = run([{ type: "sending", index: 2 }, { type: "failed", index: 2, error: "e", permanent: false }], s);
    console.log("2回失敗時 stopped=", s.stopped, "cf=", s.consecutiveFailures);
    s = run([{ type: "sending", index: 1 }, { type: "failed", index: 1, error: "e", permanent: false }], s);
    console.log("3回失敗時 stopped=", JSON.stringify(s.stopped), "cf=", s.consecutiveFailures);
    console.log("落ちた本数(gaveUp)=", progress(s).gaveUp);
    expect(progress(s).gaveUp).toBe(0); // 1本も諦めていないのに「3本続けて…」と出る
  });
});
