/**
 * tools/testManifest.mjs（安全テストの見張り）の検査。
 *
 * なぜ: 見張りそのものが壊れると、安全テストが消えても飛ばされても誰も気づけない。
 * ここでは「わざと壊した状態」（ファイルを消す・名前を変える・飛ばす書き方を入れる・
 * 集計に skipped を混ぜる・テストが偽の集計行を書く）を1つずつ作り、見張りが該当の名前を挙げて止めることを確かめる。
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
  checkReportDetails,
  checkRunSummary,
  diffTestFiles,
  findSkipMarkers,
  formatNotPassed,
  parseSummaryLine,
  readReportDetails,
  stripAnsi,
  validateManifest,
} from "./testManifest.mjs";

/**
 * 飛ばす書き方を、このファイルの字面に書かずに組み立てる。
 * なぜ: このファイル自身も safety-tests.json に載っているので、字面で書くと見張りが自分を捕まえる。
 */
const call = (target: string, method: string) => `${target}.${method}(`;
/** かっこを付けない参照（`it` の `skip` をそのまま別名へ入れる形）。字面に書かない理由は call と同じ。 */
const prop = (...path: string[]) => path.join(".");

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
    // かっこを付けずに別名へ入れてから呼ぶ形（検収の指摘 2026-09-23: 引数つきの実行では集計の検査が走らない）
    ["別名へ入れた it の skip", `const s = ${prop("it", "skip")};\ns(`],
    ["別名へ入れた describe の skip", `const d = ${prop("describe", "skip")}\nd(`],
    ["別名へ入れた test の only", `const o = ${prop("test", "only")};\no(`],
    ["別名へ入れた suite の todo", `const t = ${prop("suite", "todo")};\nt(`],
    [
      "別名へ入れた続け書き（concurrent のあとに skip）",
      `const c = ${prop("describe", "concurrent", "skip")};\nc(`,
    ],
    ["別名へ入れた、空白や改行を挟んだ書き方", `const s = ${prop("it ", "\n  skip")};\ns(`],
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
      // 別名の形を拾うようにしても、it / test / describe / suite 以外の普通のプロパティは拾わない
      "const t = result.todo;",
      "const s = testing.skip;",
      "const k = suiteName.only;",
      "const v = split.skipped;",
    ].join("\n");
    expect(findSkipMarkers(source)).toEqual([]);
  });

  it("かっこ付きの形を、別名の形と二重に数えない（1か所は1件）", () => {
    const source = `${call("it", "skip")}"a", () => {});\n${prop("describe", "only", "each")}([1])("b", () => {});\nconst s = ${prop("test", "todo")};`;
    expect(findSkipMarkers(source)).toEqual([
      { marker: call("", "skip"), line: 1 },
      { marker: `${call("", "only").slice(0, -1)}.`, line: 2 },
      { marker: prop("test", "todo"), line: 3 },
    ]);
  });
});

describe("readReportDetails・formatNotPassed・diffTestFiles: 落ちたときに名前で挙げる", () => {
  // vitest の JSON レポート（--reporter=json）と同じ形。name は絶対パス（vitest は / 区切りで出す）
  const ROOT = "/repo";
  const toRelative = (abs: string) => abs.replace(`${ROOT}/`, "");
  const report = {
    testResults: [
      {
        name: `${ROOT}/lib/privacy/vault.test.ts`,
        assertionResults: [
          { ancestorTitles: ["札入れ"], title: "戻す", status: "passed" },
          { ancestorTitles: ["札入れ", "別名"], title: "飛ばした", status: "skipped" },
        ],
      },
      {
        name: `${ROOT}/lib/draftText.test.ts`,
        assertionResults: [{ ancestorTitles: [], title: "予定だけ", status: "todo" }],
      },
    ],
  };

  it("走ったファイルと、合格以外のテストをファイル名・describe・テスト名つきで返す", () => {
    expect(readReportDetails(report, toRelative)).toEqual({
      ranFiles: ["lib/draftText.test.ts", "lib/privacy/vault.test.ts"],
      notPassed: [
        { file: "lib/privacy/vault.test.ts", name: "札入れ > 別名 > 飛ばした", status: "skipped" },
        { file: "lib/draftText.test.ts", name: "予定だけ", status: "todo" },
      ],
    });
  });

  it.each([
    ["null", null],
    ["testResults が無い", {}],
    ["ファイル名が無い", { testResults: [{ assertionResults: [] }] }],
    ["テストの一覧が無い", { testResults: [{ name: "/repo/a.test.ts" }] }],
  ])("形が読めないとき（%s）は null（合格扱いにはしない ── 呼ぶ側が「特定できなかった」と書く）", (_label, value) => {
    expect(readReportDetails(value, toRelative)).toBeNull();
  });

  it("ファイルごとにまとめ、ファイル名・件数・テスト名・状態を出す", () => {
    const details = readReportDetails(report, toRelative);
    expect(formatNotPassed(details?.notPassed ?? [])).toEqual([
      "lib/draftText.test.ts（1 件）",
      "    予定だけ ── 中身の無い予定のまま",
      "lib/privacy/vault.test.ts（1 件）",
      "    札入れ > 別名 > 飛ばした ── 飛ばされています",
    ]);
  });

  it("1ファイルで多いときは、決めた件数まで名前を出し、残りは件数だけにする", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      file: "lib/privacy/vault.test.ts",
      name: `t${i}`,
      status: "skipped",
    }));
    const lines = formatNotPassed(many, 10);
    expect(lines[0]).toBe("lib/privacy/vault.test.ts（12 件）");
    expect(lines).toHaveLength(12);
    expect(lines.at(-1)).toBe("    ほか 2 件");
  });

  it("走らなかったファイルと、ディスクの数え方の外で走ったファイルを名前で返す", () => {
    expect(
      diffTestFiles(
        ["lib/a.test.ts", "lib/privacy/vault.test.ts", "tools/x.test.ts"],
        ["lib/a.test.ts", "tools/x.test.ts", "other/y.test.ts"],
      ),
    ).toEqual({ notRun: ["lib/privacy/vault.test.ts"], notOnDisk: ["other/y.test.ts"] });
  });
});

describe("checkReportDetails: JSON レポートを、集計行とは別の2つ目の判定にする", () => {
  // なぜ（検収の指摘 2026-09-23）: 集計行は画面の文字なので、テストが同じ形の偽の行を書ける。
  // JSON レポートは vitest がテストの状態から直接書くので、偽の集計行が勝っても、ここで落ちる。
  const onDisk = ["lib/a.test.ts", "lib/privacy/vault.test.ts"];
  const allPassed = {
    ranFiles: ["lib/a.test.ts", "lib/privacy/vault.test.ts"],
    notPassed: [],
  };

  it("全ファイルが走り、全テストが合格なら、問題は0件", () => {
    expect(checkReportDetails(allPassed, onDisk)).toEqual([]);
  });

  it("飛ばされたテストが1件でもあれば、ファイル名とテスト名を挙げて止める（集計行が全部合格と言っていても）", () => {
    const errors = checkReportDetails(
      {
        ...allPassed,
        notPassed: [
          { file: "lib/privacy/vault.test.ts", name: "札入れ > 戻す", status: "skipped" },
        ],
      },
      onDisk,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("1 件");
    expect(errors[0]).toContain("lib/privacy/vault.test.ts");
    expect(errors[0]).toContain("札入れ > 戻す ── 飛ばされています");
  });

  it("走らなかったファイル・ディスクの数え方の外で走ったファイルを、名前で挙げて止める（件数が同じでも）", () => {
    // 1件走らず・別の1件が数え方の外で走ると、件数の突き合わせ（②）は一致して素通りする
    const errors = checkReportDetails(
      { ranFiles: ["lib/a.test.ts", "other/y.test.ts"], notPassed: [] },
      onDisk,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("走らなかったファイル: lib/privacy/vault.test.ts");
    expect(errors[1]).toContain("ディスクの数え方の外で走ったファイル: other/y.test.ts");
  });

  it("JSON レポートを読めなければ、理由を添えて止める（読めない＝合格、にしない）", () => {
    const errors = checkReportDetails(null, onDisk, "JSON レポートを読めませんでした（ENOENT）");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("ENOENT");
    expect(checkReportDetails(null, onDisk)[0]).toContain("形が想定と違います");
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

describe("checkRunSummary: 集計行は stdout だけから読む（テストが書いた偽の集計行に負けない）", () => {
  // vitest の本物の集計は stdout の最後に出る（その後ろは JSON レポートの書き出しの知らせだけ）
  const realStdout = [
    " ✓ lib/privacy/vault.test.ts (3 tests) 12ms",
    "",
    " Test Files  62 passed (62)",
    "      Tests  627 passed | 1 skipped (628)",
    "   Start at  10:56:24",
    "   Duration  61.20s",
    "JSON report written to /repo/node_modules/.cache/run-tests-report-1.json",
    "",
  ].join("\n");
  // テストが console.error で書いた偽の集計行（stderr に出る）
  const fakeStderr =
    "stderr | lib/draftText.test.ts > fake summary probe\n      Tests  628 passed (628)\n\n";

  it("stderr の偽の集計行で、本物の skipped を隠せない（検収の指摘 2026-09-23 で緑のまま通った形）", () => {
    const { files, tests } = checkRunSummary({ stdout: realStdout, stderr: fakeStderr });
    expect(files.errors).toEqual([]);
    expect(tests.total).toBe(628);
    expect(tests.errors).toHaveLength(1);
    expect(tests.errors[0]).toContain("skipped");
  });

  it("（なぜ stdout だけか）stdout と stderr をつないで読むと、偽の集計行が勝って緑になってしまう", () => {
    // 以前の tools/run-tests.mjs の読み方。この形に戻すと上の検査が赤になることの裏づけ
    expect(checkAllPassed(`${realStdout}${fakeStderr}`, "Tests").errors).toEqual([]);
  });

  it("テストが console.log（stdout）で書いた偽の集計行は本物より前に出るので、最後の本物を使う", () => {
    const stdout = `stdout | lib/draftText.test.ts > fake summary probe\n      Tests  628 passed (628)\n\n${realStdout}`;
    expect(checkRunSummary({ stdout, stderr: "" }).tests.errors[0]).toContain("skipped");
  });

  it("集計が stderr にしか無ければ、読めないとして止める（stderr からは合格を拾わない）", () => {
    const { files, tests } = checkRunSummary({
      stdout: "",
      stderr: " Test Files  62 passed (62)\n      Tests  628 passed (628)\n",
    });
    expect(files.errors[0]).toContain("読み取れませんでした");
    expect(tests.errors[0]).toContain("読み取れませんでした");
  });

  it("色の ESC 列が付いていても読める（CI で色が付いた場合の備え）", () => {
    const esc = String.fromCharCode(27);
    const colored = realStdout.replace(" skipped", ` ${esc}[33mskipped${esc}[39m`);
    expect(stripAnsi(colored)).toBe(realStdout);
    expect(checkRunSummary({ stdout: colored }).tests.errors[0]).toContain("skipped");
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
describe("日本語を含む置き場所でも、見張りが最後まで走ること", () => {
  it("tools の道具は fs の rmSync を使わない（Node v24.4.1 の Windows では日本語のパスで黙って落ちる・消さない）", () => {
    // なぜ（2026-09-24 実測）: repo は OneDrive\デスクトップ\… にある。tools/run-tests.mjs が一時レポートを
    // rmSync で消した瞬間にプロセスごと終了コード 127 で落ち、全テスト合格でも合否の表示が出ず手元のゲートが
    // いつも赤だった（別の日本語の場所では、消さないまま成功を返した）。unlinkSync は同じパスで消せる。
    // CI は英数字だけのパスで起きないので、動かして見つける代わりに、書き方そのものをここで止める。
    const tools = join(process.cwd(), "tools");
    const offenders = readdirSync(tools)
      .filter((name) => /\.m?js$/.test(name))
      .filter((name) => {
        const source = readFileSync(join(tools, name), "utf8");
        return /\brmSync\s*\(/.test(source) || /import\s*\{[^}]*\brmSync\b[^}]*\}/.test(source);
      });
    expect(offenders).toEqual([]);
  });
});
