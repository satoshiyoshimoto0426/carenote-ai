import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * 実APIを呼ぶ統合テスト専用の設定。
 * `npm run test`（CI含む）では実行されない。手動で `npm run test:integration` を使う。
 * Claude API の課金が発生するため、生成ロジックを変えた時の動作確認用。
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.itest.ts"],
    testTimeout: 300_000,
  },
  resolve: {
    alias: {
      "@": resolve(root),
    },
  },
});
