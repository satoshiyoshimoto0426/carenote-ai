import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 公開のリポジトリに、本物のデプロイごとの URL（carenote-<英数字>-satoshiyoshimoto0426s-projects.vercel.app）を載せない見張り。
 *
 * なぜ必要か: ログインなしの試行版は、URL を知る人なら誰でも AI と計算の枠を使える（DEPLOY.md §3「公開のリポジトリに書かない」）。
 *   2026-10-08、試験のファイルに本物の試行版の URL を書いて GitHub に送ってしまった（独立審査 3回目 重大2）。
 *   人の注意だけでは同じことが起きるので、機械で止める。
 * 試験や説明で形の例が要るときは、架空の名前（下の FICTIONAL）を使う。
 */
const FICTIONAL = new Set(["carenote-abcd1234e"]);
const DEPLOYMENT_URL = /carenote-([a-z0-9]{8,12})-satoshiyoshimoto0426s-projects/g;

describe("公開のリポジトリに、本物のデプロイの URL を載せない", () => {
  it("記録されているファイルに、架空のもの以外のデプロイの URL が無い", () => {
    const files = execSync("git ls-files", { encoding: "utf8" })
      .split("\n")
      .filter((f) => f && /\.(ts|tsx|js|mjs|cjs|json|md|html|txt|yml|yaml|ps1|css)$/.test(f))
      .filter((f) => existsSync(f));
    expect(files.length).toBeGreaterThan(100);
    const hits: string[] = [];
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(DEPLOYMENT_URL)) {
        if (!FICTIONAL.has(`carenote-${m[1]}`)) hits.push(`${f}: ${m[0]}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
