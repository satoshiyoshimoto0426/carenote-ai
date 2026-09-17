import { describe, expect, it } from "vitest";
import {
  checkTranscriptInput,
  kindLabel,
  normalizeTitle,
  TEXT_MAX_CHARS,
  TITLE_MAX_CHARS,
  TRANSCRIPT_KINDS,
} from "./transcriptInput";

/**
 * ここに保存するのは**黒塗りが効かない生の個人情報**（会議に出た全員の実名）。
 * 画面から来た値をそのまま信じると、想定していないものが暗号化されずに残る。
 */
describe("保存の入力チェック: checkTranscriptInput", () => {
  it("決まった種類だけ受け付ける", () => {
    for (const kind of TRANSCRIPT_KINDS) {
      expect(checkTranscriptInput({ kind, text: "本人から相談。" }).ok, kind).toBe(true);
    }
  });

  it("知らない種類は断る（画面の言うことを信用しない）", () => {
    expect(checkTranscriptInput({ kind: "secret", text: "あ" }).ok).toBe(false);
    expect(checkTranscriptInput({ kind: 123, text: "あ" }).ok).toBe(false);
    expect(checkTranscriptInput({ text: "あ" }).ok).toBe(false);
  });

  it("空の文字起こしは保存しない", () => {
    expect(checkTranscriptInput({ kind: "meeting", text: "" }).ok).toBe(false);
    expect(checkTranscriptInput({ kind: "meeting", text: "  \n " }).ok).toBe(false);
    expect(checkTranscriptInput({ kind: "meeting" }).ok).toBe(false);
  });

  it("長すぎるものは断る（貼り間違い・二重送信を止める）", () => {
    const tooLong = "あ".repeat(TEXT_MAX_CHARS + 1);
    const result = checkTranscriptInput({ kind: "meeting", text: tooLong });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("長すぎます");
  });

  it("上限ちょうどは受け付ける", () => {
    expect(checkTranscriptInput({ kind: "meeting", text: "あ".repeat(TEXT_MAX_CHARS) }).ok).toBe(
      true,
    );
  });

  it("前後の余白は落として保存する", () => {
    const result = checkTranscriptInput({ kind: "call", text: "  本人から電話。  " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.text).toBe("本人から電話。");
  });

  it("本文の改行は保つ（会議の記録は行で意味を持つ）", () => {
    const result = checkTranscriptInput({ kind: "meeting", text: "1行目\n2行目" });
    expect(result.ok && result.text).toBe("1行目\n2行目");
  });
});

describe("見出しの整え方: normalizeTitle", () => {
  it("改行と制御文字を落として1行にする（一覧が崩れないように）", () => {
    expect(normalizeTitle("9月17日\n担当者会議")).toBe("9月17日 担当者会議");
    expect(normalizeTitle(`会議${String.fromCharCode(0)}メモ`)).toBe("会議 メモ");
  });

  it("長すぎる見出しは切る", () => {
    expect(normalizeTitle("あ".repeat(100))).toHaveLength(TITLE_MAX_CHARS);
  });

  it("文字列でなければ空にする", () => {
    expect(normalizeTitle(undefined)).toBe("");
    expect(normalizeTitle(42)).toBe("");
    expect(normalizeTitle(null)).toBe("");
  });

  it("見出しが無くても保存はできる（必須にしない）", () => {
    expect(checkTranscriptInput({ kind: "meeting", text: "あ" }).ok).toBe(true);
  });
});

describe("種類の名前: kindLabel", () => {
  it("画面に出す日本語を返す", () => {
    expect(kindLabel("meeting")).toBe("担当者会議");
    expect(kindLabel("call")).toBe("電話");
  });

  it("知らない種類はそのまま返す（表示が壊れて落ちない）", () => {
    expect(kindLabel("unknown")).toBe("unknown");
  });
});
