import { describe, expect, it } from "vitest";
import { AUDIO_MAX_BYTES, PLATFORM_MAX_BYTES } from "@/lib/transcribe/validate";
import {
  BYTES_PER_SECOND,
  configIsSane,
  estimateBytes,
  MAX_ATTEMPTS,
  MAX_CONSECUTIVE_FAILURES,
  maxSegmentCount,
  maxSegmentMs,
  SEGMENT_MAX_BYTES,
  SEGMENT_MAX_MS,
  TOTAL_MAX_MS,
} from "./config";

/**
 * 数字どうしの関係を固定する。
 *
 * なぜ必要か:
 *   録音は「どこかの数字を1つ上げた瞬間、本番の会議の途中で初めて失敗する」壊れ方をする。
 *   区切りが送信の上限を超えれば、その区切りだけ落ちて会議に穴が空く ── しかも
 *   気づくのは会議が終わったあと。数字の関係が壊れたら、ここで落ちるようにしておく。
 */
describe("録音の決めごと", () => {
  it("区切りの上限は、送信の上限より小さい（超えるとその区切りだけ落ちる）", () => {
    expect(SEGMENT_MAX_BYTES).toBeLessThan(AUDIO_MAX_BYTES);
    expect(AUDIO_MAX_BYTES).toBeLessThan(PLATFORM_MAX_BYTES);
  });

  it("5分ぶん録っても、見込み容量は区切りの上限に収まる", () => {
    expect(estimateBytes(SEGMENT_MAX_MS)).toBeLessThan(SEGMENT_MAX_BYTES);
  });

  it("値そのものを固定する（自分の定数で自分を測ると、書き換えても落ちない）", () => {
    expect(SEGMENT_MAX_BYTES).toBe(3 * 1024 * 1024);
    expect(SEGMENT_MAX_MS).toBe(300_000);
    expect(TOTAL_MAX_MS).toBe(6_000_000);
    expect(MAX_ATTEMPTS).toBe(3);
    expect(MAX_CONSECUTIVE_FAILURES).toBe(3);
    expect(BYTES_PER_SECOND).toBe(4000);
  });

  it("関係が1つでも壊れたら configIsSane が false になる", () => {
    expect(configIsSane()).toBe(true);
  });

  it("1区切りの長さは、容量と時間の厳しいほうで決まる", () => {
    expect(maxSegmentMs()).toBeLessThanOrEqual(SEGMENT_MAX_MS);
    expect(estimateBytes(maxSegmentMs())).toBeLessThanOrEqual(SEGMENT_MAX_BYTES);
  });

  it("60分の会議が現実的な区切り数に収まる（回数制限30回を超えない）", () => {
    const sixtyMinutes = 60 * 60 * 1000;
    const segments = Math.ceil(sixtyMinutes / maxSegmentMs());
    expect(segments).toBeLessThanOrEqual(30);
    expect(segments).toBeGreaterThan(1);
  });

  it("上限いっぱい（100分）録っても、1時間30回の枠に収まる見込みである", () => {
    expect(maxSegmentCount()).toBeLessThanOrEqual(30);
  });

  it("録音全体の上限は1区切りより長い（押し忘れの歯止めであって、区切りの邪魔をしない）", () => {
    expect(TOTAL_MAX_MS).toBeGreaterThan(SEGMENT_MAX_MS * 2);
  });
});
