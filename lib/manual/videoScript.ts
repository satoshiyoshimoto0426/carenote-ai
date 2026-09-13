/**
 * 動画台本（docs/MANUAL-VIDEO-SPEC.md §5）を読み取り、字幕（WebVTT）の下書きを組み立てる。
 *
 * なぜ存在するか:
 *   台本には場面ごとの「ナレーション」と「秒」が既に書いてある。収録後に字幕を手で打ち直すと
 *   台本と字幕が必ずズレる（手順145・場面91の規模では追い切れない）。台本を唯一の正本にして、
 *   字幕は**そこから作る**ことでズレを構造的に無くす。
 *
 * 何と繋がるか:
 *   入力 = docs/MANUAL-VIDEO-SPEC.md（正本）
 *   出力 = docs/manual-video/chN.draft.vtt（下書き。収録後に実尺へ合わせてから
 *          public/manual/videos/chN.vtt として納品する）
 *   実行 = tools/build-video-captions.mjs（`npm run captions`）
 *
 * 注意: 秒数は台本の**目安**なので、出来上がる .vtt の時刻も目安。収録した映像に合わせて
 *   ずらす作業は人が行う（だから `public/` ではなく `docs/` に、`.draft.vtt` として出す）。
 */

/** 台本の1場面。表の1行に対応する。 */
export interface VideoScene {
  /** 章の中の通し番号（表の「#」列） */
  index: number;
  /** 映す画面 */
  screen: string;
  /** 操作 */
  action: string;
  /** そのまま読み上げる文 */
  narration: string;
  /** 目安の秒数 */
  seconds: number;
}

/** 台本の1章。`### ① … ── \`ch1.mp4\`（約4分・13場面）` の見出しと、その下の表。 */
export interface VideoChapter {
  /** 納品するファイル名のもと（"ch1" など） */
  slug: string;
  /** 見出しの文（章番号と題名） */
  title: string;
  scenes: VideoScene[];
}

const CHAPTER_HEADING = /^###\s+(.+?)\s*──\s*`(ch\d+)\.mp4`/;
const TABLE_ROW = /^\|(.+)\|\s*$/;
/** 場面割りの表の見出し行。§5 には別の表（⑦章の「エラー画面の出し方」）も混ざるので、これで見分ける。 */
const SCENE_HEADER = ["#", "映す画面", "操作", "ナレーション", "秒"];
/** 見出しの下の罫線（|---|---|…）。 */
function isSeparator(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c));
}

/**
 * Markdown の §5（章ごとの場面割り）から章と場面を取り出す。
 *
 * 場面割りの表は**見出し行**「# / 映す画面 / 操作 / ナレーション / 秒」で見分ける。
 * §5 には別の表も混ざるため、表の種類を確かめてから中身を読む。
 *
 * 場面割りの表の中で行が崩れていたら（列数が合わない・秒が数字でない）**例外にする**
 * ── 黙って飛ばすと字幕が1場面ぶん抜けたまま出来上がるため。ナレーションに文字としての
 * `|` を書くと列数がずれるが、それも例外になる（CI 自動審査 2026-09-13 の指摘）。
 */
export function parseVideoScript(markdown: string): VideoChapter[] {
  const lines = markdown.split(/\r?\n/);
  const chapters: VideoChapter[] = [];
  let current: VideoChapter | null = null;
  let inSection5 = false;
  let inSceneTable = false;

  for (const line of lines) {
    if (/^##\s/.test(line)) inSection5 = /^##\s+5\./.test(line);
    if (!inSection5) continue;

    const heading = CHAPTER_HEADING.exec(line);
    if (heading) {
      current = { slug: heading[2], title: heading[1].trim(), scenes: [] };
      chapters.push(current);
      inSceneTable = false;
      continue;
    }

    const row = TABLE_ROW.exec(line);
    if (!row) {
      // 表は空行や見出しで終わる（次の表の行を場面割りと取り違えない）
      inSceneTable = false;
      continue;
    }
    const cells = row[1].split("|").map((c) => c.trim());

    // 見出し行を見たら、そこから先が場面割りの表かどうかを決める
    if (cells.length === SCENE_HEADER.length && cells.every((c, i) => c === SCENE_HEADER[i])) {
      inSceneTable = true;
      continue;
    }
    if (!inSceneTable || !current) continue;
    if (isSeparator(cells)) continue;

    const index = Number(cells[0]);
    const seconds = Number(cells[4]);
    if (
      cells.length !== SCENE_HEADER.length ||
      !Number.isInteger(index) ||
      !Number.isFinite(seconds) ||
      seconds <= 0
    ) {
      throw new Error(`${current.slug}: 場面の行を読み取れません: ${line}`);
    }
    current.scenes.push({
      index,
      screen: cells[1],
      action: cells[2],
      narration: cells[3],
      seconds,
    });
  }
  return chapters;
}

/** 秒を WebVTT の時刻（00:00:00.000）にする。 */
function timestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}

/**
 * 字幕（WebVTT）の下書きを作る。場面を台本の秒数どおりに並べ、
 * 各場面の手前に「どの画面か」をコメント（NOTE）で残す ── 収録後に時刻を合わせる人が、
 * 映像のどこに当たる字幕かを迷わずに済むようにするため。
 */
export function buildVtt(chapter: VideoChapter): string {
  const out: string[] = ["WEBVTT", "", `NOTE ${chapter.title}（下書き・時刻は台本の目安）`, ""];
  let at = 0;
  for (const scene of chapter.scenes) {
    const start = at;
    at += scene.seconds;
    // NOTE（コメント）は**空行が来るまで**続く。字幕の識別子や時刻を直後に置くと、
    // それごとコメントとして飲み込まれ、再生側では字幕が1件も出ない
    // （ffmpeg で 0 件・Chrome で識別子が全滅することを独立審査 2026-09-13 が実測）。
    // だから NOTE のあとに必ず空行を入れる。
    out.push(`NOTE 場面${scene.index} ${oneLine(scene.screen)}`);
    out.push("");
    out.push(`${chapter.slug}-${scene.index}`);
    out.push(`${timestamp(start)} --> ${timestamp(at)}`);
    out.push(oneLine(scene.narration));
    out.push("");
  }
  return out.join("\n");
}

/**
 * WebVTT の1行に収める。`-->` を含む行は時刻行と誤解され、空行は塊の区切りになるため、
 * 字幕の本文やコメントに紛れ込ませない。
 */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").replace(/-->/g, "→").trim();
}

/** 章の合計秒数（納品物の目安の長さと突き合わせるため）。 */
export function totalSeconds(chapter: VideoChapter): number {
  return chapter.scenes.reduce((n, s) => n + s.seconds, 0);
}
