/**
 * 音声ファイルの受け入れ判定（純粋ロジック・テスト対象）。
 *
 * なぜ存在するか:
 *   外部の文字起こしサービスへ送る前に、形式と大きさを手元で弾く（送ってから断られると
 *   音声が無駄に外へ出る）。上限は採用サービスの公開仕様（25 MB・mp3/mp4/mpeg/mpga/m4a/wav/webm）に合わせる。
 *   docs/specs/call-pipeline.md 第3段。
 */

/** 採用サービスの公開上限（2026-09-09 確認）。仕様が変わったらここだけ直す */
export const AUDIO_MAX_BYTES = 25 * 1024 * 1024;
export const AUDIO_EXTENSIONS = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"] as const;

export type AudioCheck = { ok: true; ext: string } | { ok: false; reason: string };

export function validateAudio(name: string, size: number): AudioCheck {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (!(AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      reason: `対応していない形式です（${AUDIO_EXTENSIONS.join("・")} のみ）。`,
    };
  }
  if (size <= 0) return { ok: false, reason: "空のファイルです。" };
  if (size > AUDIO_MAX_BYTES) {
    return {
      ok: false,
      reason: `ファイルが大きすぎます（上限 ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)} MB）。短く分けて録音してください。`,
    };
  }
  return { ok: true, ext };
}

/** 外部サービスのエラーを職員向けの言葉に直す（原文はサーバログにだけ出す）。 */
export function explainTranscribeError(status: number, body: string): string {
  if (status === 401) return "文字起こしサービスの鍵が無効です。管理者に確認してください。";
  if (status === 413) return "音声が大きすぎて受け付けられませんでした。短く分けてください。";
  if (status === 429)
    return "文字起こしサービスが混み合っています。少し待ってからもう一度お試しください。";
  if (/insufficient_quota|billing|credit/i.test(body)) {
    return "文字起こしサービスの利用枠が不足しています。管理者に残高の追加を依頼してください。";
  }
  return "文字起こしに失敗しました。しばらくして再度お試しください。";
}
