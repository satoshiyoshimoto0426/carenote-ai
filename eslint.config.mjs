import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // ブラウザ拡張(MV3)は別ランタイム成果物。webext globals(chrome等)を持ち、
    // Next向けESLint設定の対象外。整形・lintはBiomeが担保する。
    "extension/**",
  ]),
]);

export default eslintConfig;
