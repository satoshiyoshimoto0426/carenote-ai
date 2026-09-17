import { describe, expect, it } from "vitest";
import { TOTAL_MAX_MS } from "@/lib/recording/config";
import { initialQueue, nextWaiting, progress, reduceQueue } from "@/lib/recording/segments";

describe("PROOF-1: stopped が立つと、待機中の区切りは永久に送られない", () => {
  it("100分の自動停止（finish(reason)）の直後、最後の区切りは送られず pending が残り続ける", () => {
    // 画面と同じ順番を再現する:
    //  1) 区切りが1本たまっている（closeSegment → add）
    //  2) 100分に達した → finish(reason) → setQueue(stop)
    let q = reduceQueue(initialQueue, { type: "add", bytes: 1000 });
    expect(nextWaiting(q)?.index).toBe(1); // 止める前は送れる
    q = reduceQueue(q, {
      type: "stop",
      reason: `${Math.round(TOTAL_MAX_MS / 60000)}分の上限に達したので録音を止めました。`,
    });
    // ここが本体: 送信エフェクトは nextWaiting を見る（RecordingPanel.tsx:204）
    expect(nextWaiting(q)).toBeNull();          // → 1本目は二度と送られない
    expect(progress(q).pending).toBe(1);        // → pending は 0 にならない
    expect(progress(q).gaveUp).toBe(0);         // → 「諦めた」にも数えられない
    expect(q.segments[0].status).toBe("waiting");
  });

  it("次の録音を始めても stopped は残る（start() は queue を初期化しない）", () => {
    let q = reduceQueue(initialQueue, { type: "stop", reason: "前回の停止" });
    // 2回目の録音で作られた区切り
    q = reduceQueue(q, { type: "add", bytes: 2000 });
    q = reduceQueue(q, { type: "add", bytes: 2000 });
    expect(nextWaiting(q)).toBeNull(); // 2回目の録音は1文字も文字にならない
    expect(progress(q)).toEqual({ total: 2, done: 0, gaveUp: 0, pending: 2 });
  });

  it("1本を3回やり直しただけで『3本続けて…』と表示される（連続本数ではなく試行回数で数えている）", () => {
    let q = reduceQueue(initialQueue, { type: "add", bytes: 1000 });
    for (let i = 0; i < 3; i++) {
      q = reduceQueue(q, { type: "sending", index: 1 });
      q = reduceQueue(q, { type: "failed", index: 1, error: "一時的な失敗", permanent: false });
    }
    expect(q.segments.length).toBe(1); // 区切りは1本しかない
    expect(q.stopped).toContain("3本続けて文字にできませんでした");
  });
});
