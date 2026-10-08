import { describe, expect, it } from "vitest";
import { maskPii } from "./maskPii";
import { createPiiVault } from "./vault";

/**
 * 黒塗りの速さの見張り（独立審査 2026-10-08 重大1 の再発防止）。
 *
 * なぜ必要か: メールの型の長さに上限が無く、「@ の無い英数字の長い並び」で長さの2乗の時間がかかっていた
 *   （6万字で約11〜15秒）。ログインなしの試行版では誰でも送れる道に乗っていて、Vercel の計算の枠を
 *   使い切って CareNote 本番まで止めうる形だった。型を足す・直すときに同じ形を作り込んだら、ここが赤になる。
 * 入れる文: 送れる長さの上限（合計6万字 ── lib/generation/dispatch.ts）で、型が「始まりの位置ごとに読み直す」
 *   形になりやすい並び（英数字・数字・区切り・点・電話の前置き・都道府県・市区町村・生年月日の言葉）。
 *   直す前は a・digits・dashdigits・zerodash・adot・tel が11〜15秒、直したあとはどれも0.05秒ほど（2026-10-08 手元で測定）。
 */
const N = 60_000;
const rep = (unit: string) => unit.repeat(Math.ceil(N / unit.length)).slice(0, N);
const HOSTILE: Record<string, string> = {
  英字: rep("a"),
  数字: rep("1"),
  数字とハイフン: rep("1-"),
  ゼロとハイフン: rep("0-"),
  英字と点: rep("a."),
  電話の前置き: rep("TEL0"),
  メールの形: rep("a@a."),
  都道府県: rep("大阪府1"),
  市区町村: rep("市町1-"),
  生年月日: rep("生年月日1"),
  混ぜたもの: rep("a1-.@ +81("),
};

describe("黒塗りは、送れる上限の長さの意地悪な文でもすぐ終わる", () => {
  for (const [name, text] of Object.entries(HOSTILE)) {
    it(`${name}（${N}字）`, () => {
      const started = performance.now();
      try {
        maskPii(text, [], createPiiVault());
      } catch {
        // 漏れ検査で止まる文もある（数字の長い並びなど）。ここで見るのは時間だけ
      }
      // 直す前は11秒以上。CI の遅さを見込んで2秒を上限にする（直したあとは0.05秒ほど）
      expect(performance.now() - started).toBeLessThan(2_000);
    });
  }
});
