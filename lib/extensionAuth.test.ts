import { describe, expect, it } from "vitest";
import {
  hitRateLimit,
  matchBearer,
  parseExtensionTokens,
  type RateState,
  resolveCorsOrigin,
} from "./extensionAuth";

// テスト用トークンは実運用同様に十分長い値を使う（最小長16未満は弾かれるため）。
const TOK_A = "tanaka-tok-1111-2222";
const TOK_B = "sato-tok-3333-4444-5555";
const TOK_LEGACY = "legacy-token-aaaa-bbbb";

describe("parseExtensionTokens", () => {
  it("複数トークン（ラベル:値）をカンマ区切りで読む", () => {
    const t = parseExtensionTokens({ CARENOTE_EXTENSION_TOKENS: `cm01:${TOK_A}, cm02:${TOK_B}` });
    expect(t).toEqual([
      { label: "cm01", token: TOK_A },
      { label: "cm02", token: TOK_B },
    ]);
  });

  it("旧・単一トークンは default ラベルで後方互換", () => {
    const t = parseExtensionTokens({ CARENOTE_EXTENSION_TOKEN: TOK_LEGACY });
    expect(t).toEqual([{ label: "default", token: TOK_LEGACY }]);
  });

  it("両方あれば両方読む", () => {
    const t = parseExtensionTokens({
      CARENOTE_EXTENSION_TOKENS: `a:${TOK_A}, b:${TOK_B}`,
      CARENOTE_EXTENSION_TOKEN: TOK_LEGACY,
    });
    expect(t).toContainEqual({ label: "a", token: TOK_A });
    expect(t).toContainEqual({ label: "b", token: TOK_B });
    expect(t).toContainEqual({ label: "default", token: TOK_LEGACY });
  });

  it("短すぎるトークン（16字未満）や空は弾く", () => {
    const t = parseExtensionTokens({
      CARENOTE_EXTENSION_TOKENS: "weak:short, ,:onlyval, ok:this-is-long-enough-token",
    });
    expect(t).toEqual([{ label: "ok", token: "this-is-long-enough-token" }]);
  });

  it("未設定なら空配列（＝全拒否につながる）", () => {
    expect(parseExtensionTokens({})).toEqual([]);
  });
});

describe("matchBearer", () => {
  const tokens = [
    { label: "cm01", token: TOK_A },
    { label: "cm02", token: TOK_B },
  ];

  it("一致すればラベルを返す", () => {
    expect(matchBearer(tokens, `Bearer ${TOK_B}`)).toBe("cm02");
  });

  it("不一致・空・Bearer無しは null", () => {
    expect(matchBearer(tokens, "Bearer wrong-token-value-xxxx")).toBeNull();
    expect(matchBearer(tokens, "")).toBeNull();
    expect(matchBearer(tokens, TOK_A)).toBeNull(); // Bearer 接頭辞なし
    expect(matchBearer([], `Bearer ${TOK_A}`)).toBeNull(); // トークン未設定
  });
});

describe("resolveCorsOrigin", () => {
  it("拡張スキームは許可", () => {
    expect(resolveCorsOrigin("chrome-extension://abcdef", {})).toBe("chrome-extension://abcdef");
  });

  it("許可リストの完全一致は許可・それ以外は null", () => {
    const env = { CARENOTE_EXTENSION_ORIGINS: "https://carenote.example.com" };
    expect(resolveCorsOrigin("https://carenote.example.com", env)).toBe(
      "https://carenote.example.com",
    );
    expect(resolveCorsOrigin("https://evil.example.com", env)).toBeNull();
  });

  it("Origin 無しは null（CORS非対象）", () => {
    expect(resolveCorsOrigin(null, {})).toBeNull();
    expect(resolveCorsOrigin("https://evil.example.com", {})).toBeNull();
  });
});

describe("hitRateLimit", () => {
  it("上限までは通し、超過で limited", () => {
    const store = new Map<string, RateState>();
    const opts = { limit: 3, windowMs: 60_000 };
    expect(hitRateLimit(store, "k", 1000, opts).limited).toBe(false);
    expect(hitRateLimit(store, "k", 1001, opts).limited).toBe(false);
    expect(hitRateLimit(store, "k", 1002, opts).limited).toBe(false);
    expect(hitRateLimit(store, "k", 1003, opts).limited).toBe(true); // 4回目
  });

  it("ウィンドウ経過で回復する", () => {
    const store = new Map<string, RateState>();
    const opts = { limit: 1, windowMs: 1000 };
    expect(hitRateLimit(store, "k", 0, opts).limited).toBe(false);
    expect(hitRateLimit(store, "k", 500, opts).limited).toBe(true);
    expect(hitRateLimit(store, "k", 2000, opts).limited).toBe(false); // 窓外で回復
  });

  it("キー（トークン）ごとに独立", () => {
    const store = new Map<string, RateState>();
    const opts = { limit: 1, windowMs: 60_000 };
    expect(hitRateLimit(store, "a", 0, opts).limited).toBe(false);
    expect(hitRateLimit(store, "b", 0, opts).limited).toBe(false);
  });
});
