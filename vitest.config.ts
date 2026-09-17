import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    // .tsx も対象にする。片方だけ拾うと、置いたのに走らないテストが生まれる
    // （tools/run-tests.mjs の数え方と必ず揃えること ── 独立審査 2026-09-13）
    include: ["**/*.test.ts", "**/*.test.tsx"],
    /**
     * 同時に走らせる数を控えめにする。
     *
     * なぜ（2026-09-17 実測）:
     *   jsdom を使うテストは環境の起動だけで十数秒かかる。台数いっぱいで並列に走らせると
     *   起動が vitest の上限（60秒・変更不可の定数）を超え、**そのファイルだけ「走らなかった」**
     *   状態になる。tools/run-tests.mjs のセンサーが検出して落ちるので黙って見逃しはしないが、
     *   落ちること自体が CI を不安定にする。半分に絞ると全体の時間はほぼ変わらず、起動が間に合う。
     */
    maxWorkers: "50%",
  },
  resolve: {
    alias: {
      "@": resolve(root),
    },
  },
});
