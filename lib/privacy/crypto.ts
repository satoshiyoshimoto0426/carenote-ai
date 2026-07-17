import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * 要配慮個人情報（実名など）のアプリ層暗号化（AES-256-GCM）。サーバ専用。
 *
 * なぜ存在するか:
 *   利用者の実名は client_identities に**暗号化して**保存し、平文でDBに残さない（SPEC §7 / 機能仕様 §7）。
 *   鍵は関数引数で受け取り、純粋にテストできるようにする（getPiiKey が環境変数から鍵を供給）。
 *
 * 形式: base64( iv[12] | authTag[16] | ciphertext )。
 */

/** 文字列を AES-256-GCM で暗号化し、base64 文字列を返す。key は 32 バイト。 */
export function encryptString(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** encryptString の出力を復号する。改ざんされていれば例外。 */
export function decryptString(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/**
 * 環境変数 CARENOTE_PII_KEY（base64 の 32 バイト鍵）から鍵を取得する。サーバ専用。
 * 生成例: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 */
export function getPiiKey(): Buffer {
  const raw = process.env.CARENOTE_PII_KEY;
  if (!raw) {
    throw new Error("CARENOTE_PII_KEY が未設定です（PII暗号化鍵・base64の32バイト）。");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CARENOTE_PII_KEY は base64 で 32 バイトである必要があります。");
  }
  return key;
}
