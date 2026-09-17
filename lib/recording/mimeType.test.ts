import { describe, expect, it } from "vitest";
import { validateAudio } from "@/lib/transcribe/validate";
import { candidatesAreAccepted, pickRecordingType, segmentFileName } from "./mimeType";

/**
 * 録る形式と、送れる形式が食い違わないことを固定する。
 * 食い違うと、会議を1本録り終えたあとで「対応していない形式です」と断られる ──
 * 一番遅く、一番取り返しのつかない失敗の仕方になる。
 */
describe("録る形式を選ぶ: pickRecordingType", () => {
  it("Chrome（webm/opus が使える）なら webm を選ぶ ── 同じ音質で一番小さい", () => {
    const type = pickRecordingType((t) => t.startsWith("audio/webm"));
    expect(type).toEqual({ mimeType: "audio/webm;codecs=opus", extension: "webm" });
  });

  it("opus 指定が通らなくても、素の webm があれば使う", () => {
    const type = pickRecordingType((t) => t === "audio/webm");
    expect(type?.extension).toBe("webm");
  });

  it("webm が無く mp4 だけなら mp4 を使う", () => {
    const type = pickRecordingType((t) => t === "audio/mp4");
    expect(type).toEqual({ mimeType: "audio/mp4", extension: "mp4" });
  });

  it("どれも使えなければ null（この端末では録音ボタンを出さない）", () => {
    expect(pickRecordingType(() => false)).toBeNull();
  });

  it("選んだ形式は、必ず送信側が受け取れる", () => {
    for (const supported of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"]) {
      const type = pickRecordingType((t) => t === supported);
      expect(type, supported).not.toBeNull();
      if (!type) continue;
      const check = validateAudio(segmentFileName(1, type.extension), 1024);
      expect(check.ok, `${supported} → ${type.extension}`).toBe(true);
    }
  });

  it("候補はすべて受け入れ側の対応表に載っている（対応表を削ったら落ちる）", () => {
    expect(candidatesAreAccepted()).toBe(true);
  });
});

describe("送るときのファイル名: segmentFileName", () => {
  it("番号だけの名前にする（実名も日時も入れない）", () => {
    expect(segmentFileName(1, "webm")).toBe("segment-001.webm");
    expect(segmentFileName(12, "mp4")).toBe("segment-012.mp4");
  });

  it("名前から利用者を辿れる情報が入らない", () => {
    const name = segmentFileName(3, "webm");
    expect(name).not.toMatch(/[ぁ-んァ-ヶ一-龠]/u);
    expect(name).toMatch(/^segment-\d{3}\.[a-z0-9]+$/);
  });
});
