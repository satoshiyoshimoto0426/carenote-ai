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

/**
 * Markdown の §5（章ごとの場面割り）から章と場面を取り出す。
 * 表の列は「# / 映す画面 / 操作 / ナレーション / 秒」の順であることを前提にし、
 * 崩れていたら（列数が合わない・秒が数字でない）その行を捨てずに例外にする
 * ── 黙って飛ばすと字幕が1場面ぶん抜けたまま出来上がるため。
 */
export function parseVideoScript(markdown: string): VideoChapter[] {
  const lines = markdown.split(/\r?\n/);
  const chapters: VideoChapter[] = [];
  let current: VideoChapter | null = null;
  let inSection5 = false;

  for (const line of lines) {
    if (/^##\s/.test(line)) inSection5 = /^##\s+5\./.test(line);
    if (!inSection5) continue;

    const heading = CHAPTER_HEADING.exec(line);
    if (heading) {
      current = { slug: heading[2], title: heading[1].trim(), scenes: [] };
      chapters.push(current);
      continue;
    }
    if (!current) continue;

    const row = TABLE_ROW.exec(line);
    if (!row) continue;
    const cells = row[1].split("|").map((c) => c.trim());
    if (cells.length !== 5) continue; // 表以外の行・区切り行
    if (cells[0] === "#" || /^-+$/.test(cells[0])) continue; // 見出し行・罫線

    const index = Number(cells[0]);
    const seconds = Number(cells[4]);
    if (!Number.isInteger(index) || !Number.isFinite(seconds) || seconds <= 0) {
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
    out.push(`NOTE 場面${scene.index} ${scene.screen}`);
    out.push(`${chapter.slug}-${scene.index}`);
    out.push(`${timestamp(start)} --> ${timestamp(at)}`);
    out.push(scene.narration);
    out.push("");
  }
  return out.join("\n");
}

/** 章の合計秒数（納品物の目安の長さと突き合わせるため）。 */
export function totalSeconds(chapter: VideoChapter): number {
  return chapter.scenes.reduce((n, s) => n + s.seconds, 0);
}
