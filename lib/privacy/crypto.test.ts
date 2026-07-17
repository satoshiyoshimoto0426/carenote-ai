import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptString, encryptString } from "./crypto";

describe("PII暗号化: encrypt/decrypt", () => {
  const key = randomBytes(32);

  it("暗号化→復号で元の文字列に戻る", () => {
    const plain = "山田 太郎";
    const enc = encryptString(plain, key);
    expect(enc).not.toContain("山田");
    expect(decryptString(enc, key)).toBe(plain);
  });

  it("毎回異なる暗号文になる（IVランダム）", () => {
    expect(encryptString("同じ値", key)).not.toBe(encryptString("同じ値", key));
  });

  it("鍵が違えば復号できない", () => {
    const enc = encryptString("秘密", key);
    expect(() => decryptString(enc, randomBytes(32))).toThrow();
  });
});
