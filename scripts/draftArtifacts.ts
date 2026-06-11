import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 統合テストで生成された下書きを scripts/.output/ に保存する（git管理外）。
 * vitest は成功テストの console 出力を省略するため、人間レビュー用の成果物として残す。
 */
export function saveDraftArtifact(name: string, data: unknown): string {
  const dir = resolve(process.cwd(), "scripts/.output");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
  return file;
}
