import { describe, expect, it } from "vitest";
import { AUDIO_MAX_BYTES, explainTranscribeError, validateAudio } from "./validate";

describe("音声ファイルの受け入れ: validateAudio", () => {
  it("対応形式・上限内なら受け入れる（拡張子は大文字でも可）", () => {
    expect(validateAudio("call.M4A", 1024)).toEqual({ ok: true, ext: "m4a" });
    expect(validateAudio("会議.webm", AUDIO_MAX_BYTES)).toEqual({ ok: true, ext: "webm" });
  });

  it("非対応形式・空・上限超えは理由つきで断る", () => {
    expect(validateAudio("memo.txt", 10).ok).toBe(false);
    expect(validateAudio("call.mp3", 0).ok).toBe(false);
    const big = validateAudio("call.mp3", AUDIO_MAX_BYTES + 1);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.reason).toContain("25 MB");
  });
});

describe("外部エラーの言い換え: explainTranscribeError", () => {
  it("鍵・大きさ・混雑・利用枠を職員向けの言葉にする", () => {
    expect(explainTranscribeError(401, "")).toContain("鍵");
    expect(explainTranscribeError(413, "")).toContain("大きすぎ");
    expect(explainTranscribeError(429, "")).toContain("混み合って");
    expect(explainTranscribeError(400, '{"error":{"code":"insufficient_quota"}}')).toContain(
      "利用枠",
    );
    expect(explainTranscribeError(500, "boom")).toContain("失敗");
  });
});
