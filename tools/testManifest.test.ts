/**
 * tools/testManifest.mjs（安全テストの見張り）の検査。
 *
 * なぜ: 見張りそのものが壊れると、安全テストが消えても飛ばされても誰も気づけない。
 * ここでは「わざと壊した状態」（ファイルを消す・名前を変える・飛ばす書き方を入れる・
 * 集計に skipped を混ぜる）を1つずつ作り、見張りが該当の名前を挙げて止めることを確かめる。
 * 繋がり: 判定= tools/testManifest.mjs／呼ぶ側= tools/run-tests.mjs（npm test）／一覧= tools/safety-tests.json。
 * 入口の固定: package.json の test と CI（.github/workflows/quality-gates.yml）が run-tests.mjs を通ること、
 * CI に落ちても緑にする書き方（continue-on-error・if:）が無いことも、ここで確かめる。
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import realManifest from "./safety-tests.json";
import {
  checkAllPassed,
  checkManifest,
  findSkipMarkers,
  parseSummaryLine,
  validateManifest,
} from "./testManifest.mjs";

/**
 * 飛ばす書き方を、このファイルの字面に書かずに組み立てる。
 * なぜ: このファイル自身も safety-tests.json に載っているので、字面で書くと見張りが自分を捕まえる。
 */
const call = (target: string, method: string) => `${target}.${method}(`;

const MANIFEST = {
  protectedDirs: [{ dir: "lib/privacy", minFiles: 2 }],
  files: [
    { path: "lib/privacy/maskPii.test.ts", why: "黒塗りの入口" },
    { path: "components/drafts/PreSendPreview.test.tsx", why: "送る前の画面" },
  ],
};
const FILES = [
  "lib/privacy/maskPii.test.ts",
  "lib/privacy/vault.test.ts",
  "components/drafts/PreSendPreview.test.tsx",
  "lib/draftText.test.ts",
];
const CLEAN = 'it("ok", () => {\n  expect(1).toBe(1);\n});\n';
const readerWith =
  (overrides: Record<string, string> = {}) =>
  (path: string) =>
    overrides[path] ?? CLEAN;

describe("checkManifest: 安全テストが消えた・名前が変わった", () => {
  it("揃っていて飛ばす書き方も無ければ、問題は0件", () => {
    expect(checkManifest(MANIFEST, FILES, readerWith())).toEqual([]);
  });

  it("名指しのファイルが消えたら、そのファイル名を挙げて止める", () => {
    const files = FILES.filter((f) => f !== "components/drafts/PreSendPreview.test.tsx");
    const errors = checkManifest(MANIFEST, files, readerWith());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("components/drafts/PreSendPreview.test.tsx");
  });

  it("同じフォルダの中で名前を変えても（件数は減らない）、元の名前を挙げて止める", () => {
    const files = FILES.map((f) =>
      f === "lib/privacy/maskPii.test.ts" ? "lib/privacy/maskPii2.test.ts" : f,
    );
    const errors = checkManifest(MANIFEST, files, readerWith());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("lib/privacy/maskPii.test.ts");
  });

  it("守るフォルダの件数が最低を下回ったら、フォルダ名と件数を挙げて止める", () => {
    const files = FILES.filter((f) => f !== "lib/privacy/vault.test.ts");
    const errors = checkManifest(MANIFEST, files, readerWith());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("lib/privacy/");
    expect(errors[0]).toContain("1 件");
    expect(errors[0]).toContain("最低 2 件");
  });

  it("一覧の形が壊れていたら、照合せずに止める（読めない一覧で合格にしない）", () => {
    expect(checkManifest(null, FILES, readerWith()).length).toBeGreaterThan(0);
    expect(checkManifest({ protectedDirs: [], files: [] }, FILES, readerWith())[0]).toContain(
      "safety-tests.json の形",
    );
  });
});

describe("checkManifest: 安全テストを飛ばす・絞る書き方", () => {
  it.each([
    ["it の skip", call("it", "skip")],
    ["describe の only", call("describe", "only")],
    ["test の todo", call("test", "todo")],
    ["条件つきで飛ばす skipIf", `${call("it", "skipIf")}true)`],
    ["条件つきで走らせる runIf", `${call("describe", "runIf")}false)`],
    ["失敗を期待する fails", call("it", "fails")],
    ["別名の xit", `x${"it"}(`],
    ["続け書き（skip のあとに each）", `${["it", "skip", "each"].join(".")}([1])(`],
    ["空白や改行を挟んだ書き方", call("it\n  ", " skip ")],
    ["角かっこの書き方", `it[${JSON.stringify("skip")}](`],
  ])("名指しのファイルに %s があれば、ファイル名を挙げて止める", (_label, snippet) => {
    const reader = readerWith({
      "lib/privacy/maskPii.test.ts": `${CLEAN}${snippet}"x", () => {});\n`,
    });
    const errors = checkManifest(MANIFEST, FILES, reader);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("lib/privacy/maskPii.test.ts:");
  });

  it("見つけた行番号を挙げる", () => {
    const source = `import { it } from "vitest";\n\n${call("it", "skip")}"x", () => {});\n`;
    const reader = readerWith({ "components/drafts/PreSendPreview.test.tsx": source });
    expect(checkManifest(MANIFEST, FILES, reader)).toEqual([
      `components/drafts/PreSendPreview.test.tsx:3 に ${call("", "skip")} があります（安全テストを飛ばす・絞る書き方は使えません）`,
    ]);
  });

  it("一覧に名指しされていなくても、守るフォルダに足された新しいファイルは見張る", () => {
    const reader = readerWith({
      "lib/privacy/vault.test.ts": `${call("describe", "only")}"x", () => {});`,
    });
    const errors = checkManifest(MANIFEST, FILES, reader);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("lib/privacy/vault.test.ts:1");
  });

  it("守る範囲の外のファイルは字面では見ない（飛ばしたテストは実行後の集計が拾う）", () => {
    const reader = readerWith({ "lib/draftText.test.ts": `${call("it", "skip")}"x", () => {});` });
    expect(checkManifest(MANIFEST, FILES, reader)).toEqual([]);
  });

  it("似ているが飛ばしではない書き方は拾わない", () => {
    const source = [
      "expect(summary.skipped).toBe(0);",
      "process.exit(0);",
      "const readonly = true;",
      'it.each([1])("n", () => {});',
      "const onlyOnce = options.onlyFirst;",
    ].join("\n");
    expect(findSkipMarkers(source)).toEqual([]);
  });
});

describe("validateManifest: 一覧の形", () => {
  it("正しい形なら誤りは0件", () => {
    expect(validateManifest(MANIFEST)).toEqual([]);
  });

  it.each([
    [
      "最低件数が0",
      { ...MANIFEST, protectedDirs: [{ dir: "lib/privacy", minFiles: 0 }] },
      "minFiles",
    ],
    [
      "フォルダの末尾に /",
      { ...MANIFEST, protectedDirs: [{ dir: "lib/privacy/", minFiles: 1 }] },
      "lib/privacy/",
    ],
    [
      "テストではないファイル",
      { ...MANIFEST, files: [{ path: "lib/privacy/maskPii.ts", why: "x" }] },
      "maskPii.ts",
    ],
    [
      "\\ 区切りのファイル",
      { ...MANIFEST, files: [{ path: "lib\\privacy\\a.test.ts", why: "x" }] },
      "a.test.ts",
    ],
    ["同じファイルが二重", { ...MANIFEST, files: [MANIFEST.files[0], MANIFEST.files[0]] }, "二重"],
    ["守る理由が空", { ...MANIFEST, files: [{ path: "lib/privacy/a.test.ts", why: " " }] }, "why"],
  ])("%s なら誤りとして挙げる", (_label, manifest, expected) => {
    const errors = validateManifest(manifest);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(expected);
  });
});

describe("checkAllPassed: vitest の集計行に飛ばしたテストが混ざっていないか", () => {
  const out = (files: string, tests: string) =>
    ` Test Files  ${files}\n      Tests  ${tests}\n   Start at  10:56:24\n`;

  it("全部合格なら誤りは0件で、全体の件数を返す", () => {
    const output = out("54 passed (54)", "494 passed (494)");
    expect(checkAllPassed(output, "Test Files")).toEqual({ total: 54, errors: [] });
    expect(checkAllPassed(output, "Tests")).toEqual({ total: 494, errors: [] });
  });

  it.each([
    ["1 skipped", "493 passed | 1 skipped (494)", "skipped"],
    ["1 todo", "493 passed | 1 todo (494)", "todo"],
    ["1 expected fail", "493 passed | 1 expected fail (494)", "expected fail"],
    ["どこにも数えられない1件", "493 passed (494)", "合いません"],
    ["知らない項目", "493 passed | 1 flaky (494)", "1 flaky"],
  ])("Tests に %s があれば止める", (_label, tests, expected) => {
    const { errors } = checkAllPassed(out("54 passed (54)", tests), "Tests");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(expected);
  });

  it("Test Files に skipped があれば止める（ファイルごと飛ばした）", () => {
    const { errors } = checkAllPassed(
      out("53 passed | 1 skipped (54)", "494 passed (494)"),
      "Test Files",
    );
    expect(errors[0]).toContain("skipped");
  });

  it("集計行が無ければ、読めないとして止める", () => {
    const result = checkAllPassed("RUN v4.1.8\n", "Tests");
    expect(result.total).toBeNull();
    expect(result.errors[0]).toContain("読み取れませんでした");
  });
});

describe("parseSummaryLine: 集計行の読み方", () => {
  it("項目ごとの数と全体の数に分ける（Windows の改行でも読める）", () => {
    expect(parseSummaryLine("      Tests  3 passed | 1 skipped (4)\r\n", "Tests")).toEqual({
      total: 4,
      counts: { passed: 3, skipped: 1 },
      unknown: [],
    });
  });

  it("Tests を探すときに Test Files の行を取り違えない", () => {
    expect(parseSummaryLine(" Test Files  2 passed (2)\n", "Tests")).toBeNull();
  });

  it("同じ見出しの行が途中にあっても、最後の集計行を使う", () => {
    const output = "      Tests  1 passed (1)\n...\n      Tests  2 passed | 1 todo (3)\n";
    expect(parseSummaryLine(output, "Tests")?.total).toBe(3);
  });
});

describe("いま使っている一覧 tools/safety-tests.json", () => {
  it("形が正しい", () => {
    expect(validateManifest(realManifest)).toEqual([]);
  });

  it("吉本さんが決めた5つのフォルダを丸ごと守っている（2026-09-23）", () => {
    expect(realManifest.protectedDirs.map((d) => d.dir).sort()).toEqual(
      ["lib/privacy", "lib/recording", "lib/rescue", "lib/transcribe", "tests/api"].sort(),
    );
  });

  it("送る前の画面・録音・CSS・名簿・字幕の安全テストを名指しで守っている", () => {
    const paths = realManifest.files.map((f) => f.path);
    for (const core of [
      "components/drafts/PreSendPreview.test.tsx",
      "components/recording/RecordingPanel.test.tsx",
      "components/recording/RecordingPanel.live.test.tsx",
      "app/globals.test.ts",
      "lib/db/clients.test.ts",
      "lib/db/transcripts.test.ts",
      "lib/manual/videoScript.test.ts",
      "tools/testManifest.test.ts",
    ]) {
      expect(paths).toContain(core);
    }
  });

  it("AI への指示に「氏名・実名・個人情報を書かせない」を固定している検査（lib/generation）は、すべて名指しで守る", () => {
    // なぜ: 2026-09-23 の検収で、同じ種類の3件のうち kaipokeAssessment.test.ts だけが一覧から漏れていた
    // （消しても npm test が緑のままだった）。名前を並べるだけでは次の漏れを防げないので、
    // 字面から「その種類の検査」を拾い、一覧と突き合わせる。
    const dir = join(process.cwd(), "lib", "generation");
    const pinsNoPii = /toContain\(\s*["'`][^"'`]*(氏名|実名|個人情報)/;
    const found = readdirSync(dir)
      .filter((name) => /\.test\.tsx?$/.test(name))
      .filter((name) => pinsNoPii.test(readFileSync(join(dir, name), "utf8")))
      .map((name) => `lib/generation/${name}`);
    // 拾い方そのものが壊れて 0 件になり、黙って合格するのを防ぐ（今日ある3件は必ず拾えること）
    expect(found).toEqual(
      expect.arrayContaining([
        "lib/generation/kaipokeAssessment.test.ts",
        "lib/generation/rescueIntake.test.ts",
        "lib/generation/supportLogAppointments.test.ts",
      ]),
    );
    const paths = realManifest.files.map((f) => f.path);
    for (const path of found) {
      expect(paths, `${path} を tools/safety-tests.json に足してください`).toContain(path);
    }
  });
});

describe("見張りを通らずにテストを走らせる抜け道が無いこと", () => {
  const readQualityGates = () =>
    readFileSync(join(process.cwd(), ".github", "workflows", "quality-gates.yml"), "utf8");

  it("npm test も CI も、必ず tools/run-tests.mjs（一覧の照合と skipped の検査）を通る", () => {
    // なぜ: package.json の test を "vitest run" に書き換えるだけで、一覧の照合も skipped の検査も
    // 丸ごと飛ぶ。そう書き換えても vitest 自体は走るので、この検査がそこで落とす。
    expect(packageJson.scripts.test).toBe("node tools/run-tests.mjs");
    expect(readQualityGates()).toMatch(/^\s*run:\s*npm run test\s*$/m);
  });

  it("CI の Quality Gates に、落ちても緑にする continue-on-error や、段を飛ばす if: が無い", () => {
    // なぜ: `run: npm run test` の行を残したままでも、その段（またはジョブ）に continue-on-error: true や
    // if: false を足すだけで、見張りが落ちても・走らなくても CI は緑になる。入口の書き換えと同じ抜け道なので
    // ここで一緒に塞ぐ。本当に条件が要るときは、この検査を直す差分がレビューに見える形で出る。
    expect(readQualityGates()).not.toMatch(/^\s*(-\s+)?(continue-on-error|if)\s*:/m);
  });
});
