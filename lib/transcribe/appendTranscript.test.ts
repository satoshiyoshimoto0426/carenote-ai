import { describe, expect, it } from "vitest";
import { appendTranscript, TRANSCRIPT_HEADING } from "./appendTranscript";

/**
 * 職員が書いたメモを消さないことを固定する。
 * 足し方の取り違えは、画面を見るまで気づけないまま入力を失わせる。
 */
describe("文字起こしをメモへ足す: appendTranscript", () => {
  it("空欄なら、そのまま入れる（見出しは付けない）", () => {
    expect(appendTranscript("", "本人から電話。")).toBe("本人から電話。");
    expect(appendTranscript("   \n ", "本人から電話。")).toBe("本人から電話。");
  });

  it("すでに書かれていたら、消さずに見出し付きで後ろへ足す", () => {
    const result = appendTranscript("長女より相談あり。", "本人から電話。");
    expect(result).toContain("長女より相談あり。");
    expect(result).toContain(TRANSCRIPT_HEADING);
    expect(result.indexOf("長女より相談あり。")).toBeLessThan(result.indexOf("本人から電話。"));
  });

  it("2回続けて足しても、前の分が残る", () => {
    const once = appendTranscript("手書きメモ。", "1本目。");
    const twice = appendTranscript(once, "2本目。");
    expect(twice).toContain("手書きメモ。");
    expect(twice).toContain("1本目。");
    expect(twice).toContain("2本目。");
  });

  it("文字起こしが空なら、元の文章に触らない（空振りで消さない）", () => {
    expect(appendTranscript("大事なメモ", "")).toBe("大事なメモ");
    expect(appendTranscript("大事なメモ", "   ")).toBe("大事なメモ");
  });

  it("前後の余白は落とすが、本文の改行は保つ", () => {
    const result = appendTranscript("  メモ  ", "  1行目\n2行目  ");
    expect(result).toBe(`メモ\n\n${TRANSCRIPT_HEADING}\n1行目\n2行目`);
  });
});
