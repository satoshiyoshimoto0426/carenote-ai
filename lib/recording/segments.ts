/**
 * 区切りの送信状態（純粋な状態機械・テスト対象）。
 *
 * なぜ存在するか:
 *   60分の会議は十数個の区切りになる。どれかが落ちたとき「やり直す／諦めて先へ進む／
 *   録音そのものを止める」の判断を画面の中に書くと、**落ちたときの振る舞いを誰も確かめられない**。
 *   会議はやり直しが効かないので、ここだけは動かして確かめられる形にしておく。
 *
 * 長時間・自動で回る処理の3軸（横断規約 §2.7-G）をここに閉じ込める:
 *   ①停止条件 = 1区切り MAX_ATTEMPTS 回まで／連続 MAX_CONSECUTIVE_FAILURES 回で録音停止
 *   ②予算     = 区切りの数（録音全体の上限 TOTAL_MAX_MS から決まる）
 *   ③エスカレーション = 止めた理由を必ず文章で持ち、画面に出す
 *
 * ⚠ 音声そのものはここに持たない（Blob は画面側が別に持ち、送り終えたら手放す）。
 *   状態だけを扱うので、端末にもサーバにも音声は残らない。
 */
import { MAX_ATTEMPTS, MAX_CONSECUTIVE_FAILURES } from "./config";

export type SegmentStatus = "waiting" | "sending" | "done" | "gaveUp";

export interface Segment {
  /** 1始まりの通し番号（画面の「3本目」と一致させる） */
  index: number;
  bytes: number;
  status: SegmentStatus;
  /** 送信を試みた回数 */
  attempts: number;
  /** 諦めたときの理由（職員に見せる日本語） */
  error?: string;
}

export interface QueueState {
  segments: Segment[];
  /** 連続で落ちた数。1本でも通れば0に戻る */
  consecutiveFailures: number;
  /** 録音を止めた理由。null なら続けてよい */
  stopped: string | null;
}

export type QueueAction =
  | { type: "add"; bytes: number }
  | { type: "sending"; index: number }
  | { type: "done"; index: number }
  | { type: "failed"; index: number; error: string; permanent: boolean }
  | { type: "stop"; reason: string };

export const initialQueue: QueueState = { segments: [], consecutiveFailures: 0, stopped: null };

/**
 * やり直しても直らない断られ方か。
 * 鍵が無い（503）・ログインが切れた（401）・大きすぎる（413）・形式違い（400）は、
 * 何度送っても同じ結果になるうえ、そのたびに音声が外へ出る。
 */
export function isPermanentFailure(status: number): boolean {
  return status === 400 || status === 401 || status === 403 || status === 413 || status === 503;
}

export function reduceQueue(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "add": {
      const index = state.segments.length + 1;
      return {
        ...state,
        segments: [
          ...state.segments,
          { index, bytes: action.bytes, status: "waiting", attempts: 0 },
        ],
      };
    }
    case "sending":
      return {
        ...state,
        segments: state.segments.map((s) =>
          s.index === action.index ? { ...s, status: "sending", attempts: s.attempts + 1 } : s,
        ),
      };
    case "done":
      return {
        ...state,
        consecutiveFailures: 0,
        segments: state.segments.map((s) =>
          s.index === action.index ? { ...s, status: "done", error: undefined } : s,
        ),
      };
    case "failed": {
      const target = state.segments.find((s) => s.index === action.index);
      if (!target) return state;
      const giveUp = action.permanent || target.attempts >= MAX_ATTEMPTS;
      // 数えるのは**諦めた区切りの本数**。試行回数で数えると、1本が3回やり直しただけで
      // 「3本続けて失敗」になり、実際には1本しか落ちていないのに録音を止めてしまう
      // （独立審査 2026-09-17 critical。MAX_ATTEMPTS と MAX_CONSECUTIVE_FAILURES が同じ値なので必ず起きた）。
      const consecutiveFailures = giveUp
        ? state.consecutiveFailures + 1
        : state.consecutiveFailures;
      const segments = state.segments.map((s) =>
        s.index === action.index
          ? {
              ...s,
              status: giveUp ? ("gaveUp" as const) : ("waiting" as const),
              error: action.error,
            }
          : s,
      );
      if (state.stopped || consecutiveFailures < MAX_CONSECUTIVE_FAILURES) {
        return { segments, consecutiveFailures, stopped: state.stopped };
      }
      const reason = `${MAX_CONSECUTIVE_FAILURES}本続けて文字にできませんでした（${action.error}）。録音を止めました。`;
      return { segments: giveUpPending(segments, reason), consecutiveFailures, stopped: reason };
    }
    case "stop": {
      if (state.stopped) return state;
      return {
        ...state,
        segments: giveUpPending(state.segments, action.reason),
        stopped: action.reason,
      };
    }
    default:
      return state;
  }
}

/**
 * 止めるときに、まだ送っていない区切りを「諦めた」に落とす。
 *
 * なぜ要るか（独立審査 2026-09-17 critical）:
 *   止めたあと waiting のまま残すと、①送られない ②諦めたことにもならないので
 *   「◯本目が文字になりませんでした」の知らせに載らない ③画面側が音声を手放す合図を失い、
 *   会議の音声がメモリに残り続ける ── 3つ同時に壊れる。落とすときは全部落とす。
 */
function giveUpPending(segments: Segment[], reason: string): Segment[] {
  return segments.map((s) =>
    s.status === "waiting" || s.status === "sending"
      ? { ...s, status: "gaveUp" as const, error: s.error ?? reason }
      : s,
  );
}

/** 次に送る区切り。無ければ null。 */
export function nextWaiting(state: QueueState): Segment | null {
  if (state.stopped) return null;
  return state.segments.find((s) => s.status === "waiting") ?? null;
}

export interface QueueProgress {
  total: number;
  done: number;
  gaveUp: number;
  /** まだ送っていない・送っている最中 */
  pending: number;
}

export function progress(state: QueueState): QueueProgress {
  const done = state.segments.filter((s) => s.status === "done").length;
  const gaveUp = state.segments.filter((s) => s.status === "gaveUp").length;
  return {
    total: state.segments.length,
    done,
    gaveUp,
    pending: state.segments.length - done - gaveUp,
  };
}

/** 諦めた区切りがあるか（会議に穴が空いた＝職員に必ず知らせる）。 */
export function hasGaps(state: QueueState): boolean {
  return state.segments.some((s) => s.status === "gaveUp");
}

/** 諦めた区切りの番号（「3本目と7本目が文字になりませんでした」と出すため）。 */
export function gapIndexes(state: QueueState): number[] {
  return state.segments.filter((s) => s.status === "gaveUp").map((s) => s.index);
}
