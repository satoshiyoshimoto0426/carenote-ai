import { describe, expect, it } from "vitest";
import {
  AUDIO_MAX_BYTES,
  explainTranscribeError,
  PLATFORM_MAX_BYTES,
  validateAudio,
} from "./validate";

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
    if (!big.ok) expect(big.reason).toContain("4 MB");
  });
});

/**
 * 上限が置き場（Vercel）の受け入れを超えていないことを固定する。
 *
 * 2026-09-17 にここが破れていた: 画面もマニュアルも「25MBまで」と書いていたが、本番へ 6MB を
 * 投げると Vercel が 413 を返し、アプリには届かない（実測）。職員には英語の解析エラーが出ていた。
 * 「送る前に手元で弾く」という validateAudio の存在意義そのものが成立していなかった。
 */
describe("上限は置き場の受け入れ量を超えない", () => {
  it("AUDIO_MAX_BYTES は Vercel の 4.5MB より小さい（超えると 413 がアプリに届かない）", () => {
    expect(AUDIO_MAX_BYTES).toBeLessThan(PLATFORM_MAX_BYTES);
  });

  it("包み代（multipart）ぶんの余裕がある", () => {
    expect(PLATFORM_MAX_BYTES - AUDIO_MAX_BYTES).toBeGreaterThan(256 * 1024);
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
