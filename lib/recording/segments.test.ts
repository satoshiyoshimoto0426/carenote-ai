import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, MAX_CONSECUTIVE_FAILURES } from "./config";
import {
  gapIndexes,
  hasGaps,
  initialQueue,
  isPermanentFailure,
  nextWaiting,
  progress,
  type QueueAction,
  type QueueState,
  reduceQueue,
} from "./segments";

/**
 * 落ちたときの振る舞いを固定する。
 * 担当者会議は関係者の予定を1か月かけて合わせる場で、やり直しが効かない。
 * 「やり直す／諦めて先へ進む／録音ごと止める」の判断が狂うと、会議に黙って穴が空く。
 */

const run = (actions: QueueAction[], from: QueueState = initialQueue): QueueState =>
  actions.reduce(reduceQueue, from);

const add = (n: number): QueueAction[] =>
  Array.from({ length: n }, () => ({ type: "add", bytes: 1000 }) as QueueAction);

describe("区切りの状態: reduceQueue", () => {
  it("足すと1から順に番号が付く", () => {
    const s = run(add(3));
    expect(s.segments.map((x) => x.index)).toEqual([1, 2, 3]);
    expect(s.segments.every((x) => x.status === "waiting")).toBe(true);
  });

  it("送って通れば done になり、連続失敗の数が0に戻る", () => {
    const s = run([
      ...add(2),
      { type: "sending", index: 1 },
      { type: "failed", index: 1, error: "混み合っています", permanent: false },
      { type: "sending", index: 1 },
      { type: "done", index: 1 },
    ]);
    expect(s.segments[0].status).toBe("done");
    expect(s.consecutiveFailures).toBe(0);
  });

  it("一時的な失敗はやり直す（waiting に戻る）", () => {
    const s = run([
      ...add(1),
      { type: "sending", index: 1 },
      { type: "failed", index: 1, error: "混み合っています", permanent: false },
    ]);
    expect(s.segments[0].status).toBe("waiting");
    expect(s.segments[0].attempts).toBe(1);
    expect(nextWaiting(s)?.index).toBe(1);
  });

  it("直らない断られ方（鍵切れ・大きすぎる）は1回で諦める ── 送るたびに音声が外へ出るため", () => {
    const s = run([
      ...add(1),
      { type: "sending", index: 1 },
      { type: "failed", index: 1, error: "鍵が無効です", permanent: true },
    ]);
    expect(s.segments[0].status).toBe("gaveUp");
    expect(s.segments[0].attempts).toBe(1);
  });

  it(`やり直しは ${MAX_ATTEMPTS} 回まで。超えたら諦めて先へ進む`, () => {
    let s = run(add(1));
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      s = run(
        [
          { type: "sending", index: 1 },
          { type: "failed", index: 1, error: "混み合っています", permanent: false },
        ],
        s,
      );
    }
    expect(s.segments[0].attempts).toBe(MAX_ATTEMPTS);
    expect(s.segments[0].status).toBe("gaveUp");
  });

  it(`連続で ${MAX_CONSECUTIVE_FAILURES} 本落ちたら録音を止める（直らない原因のまま音声を外へ出し続けない）`, () => {
    let s = run(add(5));
    for (let i = 1; i <= MAX_CONSECUTIVE_FAILURES; i++) {
      s = run(
        [
          { type: "sending", index: i },
          { type: "failed", index: i, error: "つながりません", permanent: true },
        ],
        s,
      );
    }
    expect(s.stopped).toContain("録音を止めました");
    expect(nextWaiting(s)).toBeNull();
  });

  it("止めた理由は最初のものを残す（あとの失敗で上書きしない）", () => {
    const s = run([
      ...add(1),
      { type: "stop", reason: "100分の上限に達しました" },
      { type: "stop", reason: "別の理由" },
    ]);
    expect(s.stopped).toBe("100分の上限に達しました");
  });

  it("止まっていたら、次に送るものは出さない", () => {
    const s = run([...add(2), { type: "stop", reason: "上限" }]);
    expect(nextWaiting(s)).toBeNull();
  });

  it("知らない番号の失敗は何も変えない", () => {
    const s = run(add(1));
    expect(reduceQueue(s, { type: "failed", index: 99, error: "x", permanent: true })).toBe(s);
  });
});

describe("進み具合と穴の知らせ", () => {
  it("送った数・諦めた数・残りを数える", () => {
    const s = run([
      ...add(4),
      { type: "sending", index: 1 },
      { type: "done", index: 1 },
      { type: "sending", index: 2 },
      { type: "failed", index: 2, error: "鍵が無効です", permanent: true },
    ]);
    expect(progress(s)).toEqual({ total: 4, done: 1, gaveUp: 1, pending: 2 });
  });

  it("諦めた区切りがあれば、その番号を出せる（会議のどこが欠けたか言えるようにする）", () => {
    const s = run([
      ...add(3),
      { type: "sending", index: 2 },
      { type: "failed", index: 2, error: "大きすぎます", permanent: true },
    ]);
    expect(hasGaps(s)).toBe(true);
    expect(gapIndexes(s)).toEqual([2]);
  });

  it("全部通れば穴は無い", () => {
    const s = run([...add(2), { type: "done", index: 1 }, { type: "done", index: 2 }]);
    expect(hasGaps(s)).toBe(false);
    expect(gapIndexes(s)).toEqual([]);
  });
});

describe("やり直しても直らない断られ方: isPermanentFailure", () => {
  it("鍵・権限・大きさ・形式は諦める", () => {
    for (const status of [400, 401, 403, 413, 503]) {
      expect(isPermanentFailure(status), `${status}`).toBe(true);
    }
  });

  it("混雑・一時的な不調はやり直す", () => {
    for (const status of [429, 500, 502, 504]) {
      expect(isPermanentFailure(status), `${status}`).toBe(false);
    }
  });
});
