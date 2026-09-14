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
  },
  resolve: {
    alias: {
      "@": resolve(root),
    },
  },
});
