/**
 * ブラウザが録れる形式のうち、文字起こしへ送れるものを選ぶ（純粋ロジック・テスト対象）。
 *
 * なぜ存在するか:
 *   ブラウザの録音機能が出す形式と、文字起こしサービスが受け取る形式は別々に決まっている。
 *   食い違うと、会議を1本録り終えたあとで「対応していない形式です」と断られる ── 一番遅く、
 *   一番取り返しのつかない失敗の仕方になる。**録音を始める前に**揃っているか確かめる。
 *
 * 何と繋がるか:
 *   受け入れ側 = lib/transcribe/validate.ts の AUDIO_EXTENSIONS
 *   使う側     = components/recording/RecordingPanel.tsx（MediaRecorder.isTypeSupported を渡す）
 *
 * 対象は Windows の Chrome のみ（吉本さん決定 D-R4・2026-09-17）。
 * それ以外のブラウザは「録れない」と正直に返し、ファイルを選ぶ方へ案内する。
 */
import { AUDIO_EXTENSIONS } from "@/lib/transcribe/validate";

export interface RecordingType {
  /** MediaRecorder へ渡す形式 */
  mimeType: string;
  /** 送るときのファイル名に付ける拡張子（validateAudio が見る） */
  extension: string;
}

/**
 * 望ましい順。webm/opus を先頭にするのは、同じ音質でいちばん容量が小さく、
 * 5分の区切りが送信の上限（3MB）に確実に収まるため。
 */
const CANDIDATES: RecordingType[] = [
  { mimeType: "audio/webm;codecs=opus", extension: "webm" },
  { mimeType: "audio/webm", extension: "webm" },
  { mimeType: "audio/mp4", extension: "mp4" },
  { mimeType: "audio/mpeg", extension: "mpeg" },
];

/**
 * 使える形式を1つ選ぶ。無ければ null（＝この端末では録音を出さない）。
 * @param isSupported ブラウザの MediaRecorder.isTypeSupported 相当。テストでは差し替える。
 */
export function pickRecordingType(isSupported: (type: string) => boolean): RecordingType | null {
  for (const candidate of CANDIDATES) {
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(candidate.extension)) continue;
    if (isSupported(candidate.mimeType)) return candidate;
  }
  return null;
}

/** 送るときのファイル名。実名や日時を入れない（名前が外へ出る経路を増やさない）。 */
export function segmentFileName(index: number, extension: string): string {
  return `segment-${String(index).padStart(3, "0")}.${extension}`;
}

/** 候補がすべて、受け入れ側の対応表に載っているか（対応表を削ったら false）。 */
export function candidatesAreAccepted(): boolean {
  return CANDIDATES.every((c) => (AUDIO_EXTENSIONS as readonly string[]).includes(c.extension));
}
