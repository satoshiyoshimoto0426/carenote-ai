/**
 * 「送る前に見る」画面を、長い文章でも実際に確認できる形に組み立てる（純粋ロジック）。
 *
 * なぜ存在するか:
 *   黒塗りで消せない名前（ご家族・他事業所の担当者・主治医）を止める最後の関門は、
 *   **職員が画面で赤い言葉を見ること**しかない（docs/specs/call-pipeline.md §2.4）。
 *   ところが録音から起こした会議の文章は1〜2万字になる。全文を1つの塊で出すと誰も読まず、
 *   最後の関門が「押すだけ」に化ける ── 仕組みは残るが安全は消える。
 *   そこで ①長い欄は畳む ②赤い言葉に通し番号を振り、1か所ずつ送ってもらう の2つを用意する。
 *
 * 何と繋がるか:
 *   候補の抽出 = lib/privacy/candidates.ts（findNameCandidates）
 *   使う側     = components/drafts/PreSendPreview.tsx
 *   仕様       = docs/specs/recording-pipeline.md R2
 */
import type { NameCandidate } from "./candidates";

/**
 * これを超える欄は畳んで出す。
 *
 * 3000字にした理由（2026-09-17 独立審査の指摘を受けて 1200 → 3000 へ）:
 *   1200字だと**手で書いたメモ（1500字程度）まで畳んでしまう**。録音を使わない今までの
 *   職員にとっては、何も良くなっていないのに見え方だけ変わる後退になる。
 *   畳みたいのは録音から起こした文章（8,000〜20,000字）だけなので、
 *   手書きが確実に収まり、文字起こしが確実に超える線を取る。
 */
export const COLLAPSE_CHARS = 3000;

/** 畳んだときに見せる先頭の長さ。 */
export const EXCERPT_CHARS = 400;

/** 赤い言葉の前後に付ける文脈の長さ（畳んでいても意味が分かる程度）。 */
export const CONTEXT_CHARS = 40;

export interface HighlightPart {
  text: string;
  /** 欄の本文の中での開始位置。並び替えが起きない分割なので、そのまま React の key に使える */
  start: number;
  /** 赤くする言葉なら、画面全体の通し番号（1始まり）。ふつうの文字は null */
  candidateNo: number | null;
  /** なぜ候補にしたか（ふきだしと、画面の文字の両方に出す。文字は redWordReasons・candidateContexts 経由） */
  reason?: string;
}

export interface FieldHighlight {
  parts: HighlightPart[];
  /** この欄に含まれる通し番号（「この欄に3か所」の表示に使う） */
  candidateNumbers: number[];
  /** 畳むべき長さか */
  long: boolean;
  /** 文字数（職員に「どれくらい長いか」を先に伝える） */
  length: number;
}

export interface PreviewHighlights {
  byField: Record<string, FieldHighlight>;
  /** 赤い言葉の総数（語の種類ではなく**出てくる回数**。1か所ずつ確認するため） */
  total: number;
}

/**
 * 欄ごとの本文を「赤くする言葉」と「それ以外」に切り分け、
 * 赤い言葉に画面全体の通し番号を振る。
 *
 * 番号は fieldOrder の順・本文の前から順に 1 から。同じ言葉が3回出れば3つの番号が付く
 * （語の種類で数えると「1件」に見えてしまい、残り2か所を見落とす）。
 */
export function buildHighlights(
  fieldOrder: readonly string[],
  fields: Record<string, string>,
  candidates: Record<string, NameCandidate[]>,
): PreviewHighlights {
  const byField: Record<string, FieldHighlight> = {};
  let no = 0;

  for (const key of fieldOrder) {
    const text = fields[key];
    if (typeof text !== "string" || text.trim().length === 0) continue;
    const found = candidates[key] ?? [];
    const numbers: number[] = [];
    const parts: HighlightPart[] = [];

    if (found.length === 0) {
      parts.push({ text, start: 0, candidateNo: null });
    } else {
      // 長い言葉から先に区切る（「田中」より「田中商店」を優先し、部分一致の取りこぼしを防ぐ）
      const words = [...new Set(found.map((c) => c.word))].sort((a, b) => b.length - a.length);
      const reasons = new Map(found.map((c) => [c.word, c.reason]));
      const re = new RegExp(`(${words.map(escapeRegExp).join("|")})`, "g");
      let at = 0;
      for (const piece of text.split(re)) {
        if (piece.length === 0) continue;
        const start = at;
        at += piece.length;
        if (reasons.has(piece)) {
          no += 1;
          numbers.push(no);
          parts.push({ text: piece, start, candidateNo: no, reason: reasons.get(piece) });
        } else {
          parts.push({ text: piece, start, candidateNo: null });
        }
      }
    }

    byField[key] = {
      parts,
      candidateNumbers: numbers,
      long: text.length > COLLAPSE_CHARS,
      length: text.length,
    };
  }

  return { byField, total: no };
}

export interface CandidateContext {
  candidateNo: number;
  /** 赤い言葉の前の文脈（頭が切れていれば … が付く） */
  before: string;
  /** 赤い言葉そのもの */
  word: string;
  /** 赤い言葉の後ろの文脈（末尾が切れていれば … が付く） */
  after: string;
  reason?: string;
}

/**
 * 赤い言葉を、その前後の文脈ごと取り出す。
 *
 * なぜ要るか（2026-09-17 独立審査の critical）:
 *   長い欄を「先頭400字だけ」に畳んだ結果、**赤い言葉が1つも画面に出ない**状態になっていた。
 *   職員が見なければならないのは本文の大半ではなく赤い言葉の方なので、畳むときは
 *   「読み飛ばしてよい地の文」を隠し、「確かめるべき赤い言葉」は必ず全部出す。
 */
export function candidateContexts(
  field: FieldHighlight,
  chars: number = CONTEXT_CHARS,
): CandidateContext[] {
  const full = field.parts.map((p) => p.text).join("");
  const out: CandidateContext[] = [];
  for (const part of field.parts) {
    if (part.candidateNo === null) continue;
    const from = Math.max(0, part.start - chars);
    const end = part.start + part.text.length;
    const to = Math.min(full.length, end + chars);
    out.push({
      candidateNo: part.candidateNo,
      before: (from > 0 ? "…" : "") + full.slice(from, part.start),
      word: part.text,
      after: full.slice(end, to) + (to < full.length ? "…" : ""),
      reason: part.reason,
    });
  }
  return out;
}

/** 開いた欄の下に並べる「なぜ赤いか」の1行分（redWordReasons の返り値）。 */
export interface RedWordReason {
  /** 赤い言葉そのもの */
  word: string;
  /** なぜ候補にしたか（「敬称の前」「施設名の可能性」） */
  reason: string;
}

/**
 * 開いた欄の赤い言葉を、**言葉ごとに1行**にまとめて理由と並べる（本文に出てくる順）。
 *
 * なぜ要るか（2026-09-23 検収の指摘）:
 *   開いた欄（3000字以下の欄と、全文を表示した欄）では、理由が <mark title> のふきだしにしか無かった。
 *   ふきだしはタッチ端末（タブレット・スマホ）では出ないので、職員は「なぜ赤いか」を読めず、
 *   施設名（そのまま送ってよい）と家族の名前（言い換える）を見分ける手がかりを失っていた。
 *   本文に差し込むと「佐藤（敬称の前）さん」のように送る文章そのものが読みにくくなり、
 *   画面の本文と送る文章もずれるので、欄の下に一覧で出す。
 *   候補は言葉ごとに理由が1つ（findNameCandidates が言葉で重ねない）なので、何度出ても1行にまとめる。
 *   何か所あるかは、欄の見出しの「赤い言葉◯か所」と「前へ／次へ」が受け持つ。
 *
 * 使う側 = components/drafts/PreSendPreview.tsx（開いた欄の下の「なぜ赤いか」）。
 * 畳んだ欄は candidateContexts の各行に理由が付くので、これは使わない。
 */
export function redWordReasons(field: FieldHighlight): RedWordReason[] {
  const seen = new Set<string>();
  const out: RedWordReason[] = [];
  for (const part of field.parts) {
    if (part.candidateNo === null || part.reason === undefined || seen.has(part.text)) continue;
    seen.add(part.text);
    out.push({ word: part.text, reason: part.reason });
  }
  return out;
}

/** 畳んだときに見せる先頭部分（切れ目に … を付ける）。 */
export function excerpt(text: string, chars: number = EXCERPT_CHARS): string {
  if (text.length <= chars) return text;
  return `${text.slice(0, chars)}…`;
}

/** 通し番号から、その言葉が入っている欄を引く。「次へ」で畳んだ欄を開くのに使う。 */
export function fieldOfCandidate(
  highlights: PreviewHighlights,
  candidateNo: number,
): string | null {
  for (const [key, field] of Object.entries(highlights.byField)) {
    if (field.candidateNumbers.includes(candidateNo)) return key;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
