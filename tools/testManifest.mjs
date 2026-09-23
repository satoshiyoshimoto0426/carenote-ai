/**
 * 安全テストが「消えた・名前が変わった・飛ばされた・絞られた」ことを見つける判定の関数（Quality Gates のセンサー）。
 *
 * なぜ存在するか（2026-09-23 吉本さん決定「安全テストが消えない・飛ばされない見張り」）:
 *   tools/run-tests.mjs は「ディスク上のテストファイル数＝走った数」しか見ていなかった。
 *   安全テストを1つ消すと両方の数が1ずつ減るので緑のまま。`it.skip` を1行入れても、
 *   集計行の「passed」しか読まないので緑のまま。黒塗り・送る前の確認・録音の停止など、
 *   壊れたら実害が出る検査ほど、黙って消えると誰も気づけない。
 *
 * 何と繋がるか:
 *   - 守る対象の正本: tools/safety-tests.json（フォルダごとの最低件数＋名指しのファイル）
 *   - 呼ぶ側: tools/run-tests.mjs（npm test と CI の quality-gates.yml が通る）。
 *     ファイルの読み込みは呼ぶ側が行い、ここは渡された中身を判定するだけ（検査しやすくするため）。
 *   - この関数たちの検査: tools/testManifest.test.ts
 */

/**
 * @typedef {{ dir: string, minFiles: number }} ProtectedDir
 * @typedef {{ path: string, why: string }} SafetyFile
 * @typedef {{ protectedDirs: ProtectedDir[], files: SafetyFile[] }} SafetyManifest
 * @typedef {{ marker: string, line: number }} SkipMarker
 * @typedef {{ total: number, counts: Record<string, number>, unknown: string[] }} SummaryLine
 */

/** vitest.config.ts の include（*.test.ts / *.test.tsx）と同じ条件。ずれると一覧に載せても走らない。 */
const TEST_FILE_RE = /\.test\.tsx?$/;

/**
 * テストを「飛ばす・絞る・未実装で置く・失敗を期待する形に反転する」書き方。
 * `.skip(` `.only(` `.todo(` と、条件つきで飛ばす `skipIf` `runIf`、反転の `fails`、
 * 別名の `xit` `xtest` `xdescribe`。`it.skip.each` のような続け書きと、`it["skip"]` の書き方も拾う。
 */
const MARKER_RES = [
  /\.\s*(?:skip|only|todo|skipIf|runIf|fails)\s*[(.]/g,
  /\[\s*["'`](?:skip|only|todo|skipIf|runIf|fails)["'`]\s*\]/g,
  /\b(?:xit|xtest|xdescribe)\s*\(/g,
];

/** vitest 4 の集計行に出る項目（node_modules/vitest の getStateString で確認・2026-09-23）。 */
const SUMMARY_STATES = ["failed", "passed", "expected fail", "skipped", "todo"];

/**
 * 集計行で「全部合格」以外を表す項目と、職員にも伝わる言い方。
 * `failed` は vitest が非ゼロで終わるので普段はここまで来ないが、念のため同じ扱いにする。
 */
const NOT_PASSED = {
  skipped: "飛ばされています（skipped）",
  todo: "中身の無い予定のまま置かれています（todo）",
  "expected fail": "「失敗して合格」に反転されています（expected fail）",
  failed: "失敗しています（failed）",
};

/**
 * 一覧（safety-tests.json）の形を確かめる。読めない一覧で「守れている」と言わないため（fail-closed）。
 * run-tests.mjs は checkManifest 経由で必ずこれを通る。
 *
 * @param {unknown} value JSON.parse した safety-tests.json の中身
 * @returns {string[]} 形の誤り（空なら正しい形）
 */
export function validateManifest(value) {
  if (typeof value !== "object" || value === null) return ["一覧がオブジェクトではありません"];
  const errors = [];
  const { protectedDirs, files } = /** @type {Record<string, unknown>} */ (value);
  if (!Array.isArray(protectedDirs) || protectedDirs.length === 0) {
    errors.push("protectedDirs（守るフォルダ）が空か、配列ではありません");
  } else {
    for (const entry of protectedDirs) {
      const dir = entry?.dir;
      if (typeof dir !== "string" || !/^[\w.-]+(\/[\w.-]+)*$/.test(dir)) {
        errors.push(
          `守るフォルダの書き方が違います: ${JSON.stringify(dir)}（例: lib/privacy。前後の / と \\ は付けない）`,
        );
      }
      if (!Number.isInteger(entry?.minFiles) || entry.minFiles < 1) {
        errors.push(`${dir} の最低件数（minFiles）は1以上の整数にしてください`);
      }
    }
  }
  if (!Array.isArray(files)) {
    errors.push("files（名指しで守るファイル）が配列ではありません");
    return errors;
  }
  const seen = new Set();
  for (const entry of files) {
    const path = entry?.path;
    if (typeof path !== "string" || path.includes("\\") || !TEST_FILE_RE.test(path)) {
      errors.push(
        `守るファイルの書き方が違います: ${JSON.stringify(path)}（/ 区切りで .test.ts か .test.tsx）`,
      );
    } else if (seen.has(path)) {
      errors.push(`守るファイルが二重に載っています: ${path}`);
    }
    seen.add(path);
    if (typeof entry?.why !== "string" || entry.why.trim() === "") {
      errors.push(`${path} に守る理由（why）がありません`);
    }
  }
  return errors;
}

/**
 * ソースの中から、テストを飛ばす・絞る書き方を探す。
 * 実行時の `ctx.skip()` のように字面で見つからないものは、集計行の検査（checkAllPassed）が拾う。
 *
 * @param {string} source テストファイルの中身
 * @returns {SkipMarker[]} 見つかった書き方と、その行番号（1始まり・出てくる順）
 */
export function findSkipMarkers(source) {
  const hits = [];
  for (const re of MARKER_RES) {
    for (const m of source.matchAll(re)) {
      const index = m.index ?? 0;
      hits.push({
        index,
        marker: m[0].replace(/\s+/g, ""),
        line: source.slice(0, index).split("\n").length,
      });
    }
  }
  return hits.sort((a, b) => a.index - b.index).map(({ marker, line }) => ({ marker, line }));
}

/**
 * 一覧どおりに安全テストが揃っていて、飛ばす書き方が無いかを確かめる。
 * run-tests.mjs が vitest を走らせる前に呼ぶ（数秒で分かることで1分待たせないため）。
 *
 * @param {unknown} manifest safety-tests.json の中身（形も確かめる）
 * @param {readonly string[]} testFiles ディスク上のテストファイル（リポジトリ直下からの / 区切り）
 * @param {(path: string) => string} readFile テストファイルの中身を返す関数
 * @returns {string[]} 見つかった問題（空なら合格）。各行に該当のファイルかフォルダの名前が入る
 */
export function checkManifest(manifest, testFiles, readFile) {
  const shapeErrors = validateManifest(manifest);
  if (shapeErrors.length > 0) return shapeErrors.map((e) => `safety-tests.json の形: ${e}`);
  const { protectedDirs, files } = /** @type {SafetyManifest} */ (manifest);
  const errors = [];
  const present = new Set(testFiles);
  const guarded = new Set();

  for (const { path } of files) {
    if (present.has(path)) guarded.add(path);
    else
      errors.push(
        `安全テスト ${path} が見つかりません（消えた・名前が変わった・.test でなくなった）`,
      );
  }
  for (const { dir, minFiles } of protectedDirs) {
    const inDir = testFiles.filter((f) => f.startsWith(`${dir}/`));
    for (const f of inDir) guarded.add(f);
    if (inDir.length < minFiles) {
      errors.push(
        `${dir}/ のテストファイルが ${inDir.length} 件で、最低 ${minFiles} 件を下回っています`,
      );
    }
  }
  for (const path of [...guarded].sort()) {
    for (const { marker, line } of findSkipMarkers(readFile(path))) {
      errors.push(
        `${path}:${line} に ${marker} があります（安全テストを飛ばす・絞る書き方は使えません）`,
      );
    }
  }
  return errors;
}

/**
 * vitest の集計行（例: `      Tests  2 failed | 10 passed | 1 skipped (13)`）を数に分ける。
 * 出力の途中に同じ見出しの行があっても、最後の集計行を使う。色の ESC 列は呼ぶ側で落としておくこと。
 *
 * @param {string} output vitest の出力（色なし）
 * @param {"Test Files" | "Tests"} title 集計行の見出し
 * @returns {SummaryLine | null} 読めなければ null
 */
export function parseSummaryLine(output, title) {
  const re = new RegExp(`^[ \\t]*${title}[ \\t]+(.+?)[ \\t]+\\((\\d+)\\)[ \\t]*\\r?$`, "gm");
  const last = [...output.matchAll(re)].at(-1);
  if (!last) return null;
  /** @type {Record<string, number>} */
  const counts = {};
  const unknown = [];
  for (const part of last[1].split("|")) {
    const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(part);
    if (m && SUMMARY_STATES.includes(m[2])) counts[m[2]] = Number(m[1]);
    else unknown.push(part.trim());
  }
  return { total: Number(last[2]), counts, unknown };
}

/**
 * 集計行が「全部合格」だけかを確かめる。skipped・todo・expected fail が1件でもあれば失敗にする。
 * 合格数と全体数が合わないとき（数え方の外で飛ばされたもの）も失敗にする。
 *
 * @param {string} output vitest の出力（色なし）
 * @param {"Test Files" | "Tests"} title 集計行の見出し
 * @returns {{ total: number | null, errors: string[] }} total は全体の件数（読めなければ null）
 */
export function checkAllPassed(output, title) {
  const summary = parseSummaryLine(output, title);
  if (!summary) {
    return {
      total: null,
      errors: [
        `vitest の集計行（${title} …）を読み取れませんでした。書式が変わった可能性があります（読めない＝確かめられないので失敗にします）`,
      ],
    };
  }
  const errors = [];
  if (summary.unknown.length > 0) {
    errors.push(
      `${title} の集計行に知らない項目があります: ${summary.unknown.join(" / ")}（確かめられないので失敗にします）`,
    );
  }
  for (const [state, label] of Object.entries(NOT_PASSED)) {
    const n = summary.counts[state];
    if (n) errors.push(`${title}: ${n} 件が${label}`);
  }
  const passed = summary.counts.passed ?? 0;
  if (errors.length === 0 && passed !== summary.total) {
    errors.push(
      `${title}: 合格 ${passed} 件と全体 ${summary.total} 件が合いません（途中で飛ばされたものがあります）`,
    );
  }
  return { total: summary.total, errors };
}
