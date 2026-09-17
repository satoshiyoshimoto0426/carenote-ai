/**
 * ブラウザ録音の決めごと（純粋な定数と検算・テスト対象）。
 *
 * なぜ存在するか:
 *   録音は「どこかの数字を1つ上げた瞬間に、本番で初めて失敗する」種類の機能になる。
 *   区切りの大きさが送信の上限を超えれば、会議の途中でその区切りだけ落ちる。
 *   数字を定数として1か所に集め、**関係が壊れたらテストが落ちる**ようにしておく。
 *   仕様: docs/specs/recording-pipeline.md R3。
 *
 * 何と繋がるか:
 *   上限の相手 = lib/transcribe/validate.ts（AUDIO_MAX_BYTES / PLATFORM_MAX_BYTES）
 *   使う側     = components/recording/RecordingPanel.tsx
 *
 * ⚠ 音声はここでも端末にも保存しない。区切りは作ったそばから送り、送り終えたら手放す。
 */
import { AUDIO_MAX_BYTES } from "@/lib/transcribe/validate";

/**
 * 1区切りの大きさの上限。
 * 送信の実効上限（AUDIO_MAX_BYTES = 4MB）より小さくする。ここを超えると、その区切りだけ
 * 「大きすぎます」で落ちる ── 会議の途中に穴が空く、最も避けたい壊れ方。
 */
export const SEGMENT_MAX_BYTES = 3 * 1024 * 1024;

/**
 * 1区切りの長さの上限（5分）。
 * 大きさと時間の両方で切るのは、静かな会議ほど容量が増えないため
 * （声が小さいと圧縮が効き、10分でも上限に届かないことがある）。
 * 短すぎると継ぎ目が増えて言葉が欠け、長すぎると失敗したときの穴が大きい。
 */
export const SEGMENT_MAX_MS = 5 * 60 * 1000;

/**
 * 録音全体の上限（100分）。
 * 担当者会議はふつう60〜90分。押し忘れで何時間も録り続ける事故を止めるための歯止め
 * （§2.7-G の停止条件）。上限に達したら自動で止め、画面に理由を出す。
 */
export const TOTAL_MAX_MS = 100 * 60 * 1000;

/** 1区切りの送信をやり直す回数。これを超えたら、その区切りは諦めて先へ進む。 */
export const MAX_ATTEMPTS = 3;

/**
 * 連続でこの数だけ区切りが落ちたら、録音そのものを止めて職員に知らせる。
 * 直らない原因（鍵切れ・回数上限・圏外）のまま録り続けても、ただ音声が外へ出るだけになる。
 */
export const MAX_CONSECUTIVE_FAILURES = 3;

/** 録音の見込み容量（1秒あたりのバイト数）。32kbps モノラルの概算。 */
export const BYTES_PER_SECOND = 32_000 / 8;

/** 指定の長さを録ったときの、おおよその容量。 */
export function estimateBytes(ms: number): number {
  return Math.round((ms / 1000) * BYTES_PER_SECOND);
}

/** 上限まで録れる見込みの長さ（ミリ秒）。容量と時間の、厳しいほうを返す。 */
export function maxSegmentMs(): number {
  const byBytes = (SEGMENT_MAX_BYTES / BYTES_PER_SECOND) * 1000;
  return Math.min(SEGMENT_MAX_MS, Math.round(byBytes));
}

/** 全体の上限まで録ったときに、いくつの区切りになるか（画面の見込み表示用）。 */
export function maxSegmentCount(): number {
  return Math.ceil(TOTAL_MAX_MS / maxSegmentMs());
}

/**
 * 定数どうしの関係が保たれているか（誰かが1つだけ数字を変えたら false）。
 * テストから呼ぶだけでなく、画面側の開発時にも使えるようにしておく。
 */
export function configIsSane(): boolean {
  return (
    SEGMENT_MAX_BYTES < AUDIO_MAX_BYTES &&
    estimateBytes(SEGMENT_MAX_MS) < SEGMENT_MAX_BYTES &&
    SEGMENT_MAX_MS < TOTAL_MAX_MS &&
    MAX_ATTEMPTS >= 1 &&
    MAX_CONSECUTIVE_FAILURES >= 1
  );
}
