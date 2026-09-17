/**
 * 音声ファイルの受け入れ判定（純粋ロジック・テスト対象）。
 *
 * なぜ存在するか:
 *   外部の文字起こしサービスへ送る前に、形式と大きさを手元で弾く（送ってから断られると
 *   音声が無駄に外へ出る）。形式は採用サービスの公開仕様（mp3/mp4/mpeg/mpga/m4a/wav/webm）に合わせる。
 *   docs/specs/call-pipeline.md 第3段。
 */

/**
 * 1ファイルの上限。
 *
 * なぜ 25MB ではないか（2026-09-17 実測で判明）:
 *   文字起こしサービス自体は 25MB まで受けるが、**その手前の置き場（Vercel）が 4.5MB で切る**。
 *   本番へ 6MB を投げると、アプリまで届かず 413 が返る（middleware にも到達しない）。
 *   実測: 1MB → 307（middleware へ到達）／6MB → 413（Vercel が拒否）。
 *   つまり 25MB は**到達できない数字**で、画面にそう書いていたのは嘘だった。
 *   multipart の包み代があるので 4.5MB ちょうどではなく 4MB を上限にする。
 *
 * これより長い録音を通したい場合は、置き場を経由しない限り無理
 *   （= 画面から Vercel Blob へ直に上げ、サーバはそこから読む。PDF と同じやり方）。
 */
export const AUDIO_MAX_BYTES = 4 * 1024 * 1024;

/** 置き場（Vercel Functions）の受け入れ上限。AUDIO_MAX_BYTES はこれを超えてはいけない。 */
export const PLATFORM_MAX_BYTES = 4.5 * 1024 * 1024;
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
      reason:
        `ファイルが大きすぎます（上限 ${Math.floor(AUDIO_MAX_BYTES / 1024 / 1024)} MB ＝ ふつうの音質で4〜5分ぶん）。` +
        "録音を短く分けるか、録音アプリの音質を下げてから選び直してください。",
    };
  }
  return { ok: true, ext };
}

/** 外部サービスのエラーを職員向けの言葉に直す（原文はサーバログにだけ出す）。 */
export function explainTranscribeError(status: number, body: string): string {
  if (status === 401) return "文字起こしサービスの鍵が無効です。管理者に確認してください。";
  if (status === 413)
    return "音声が大きすぎて受け付けられませんでした。短く分けるか、音質を下げてください。";
  if (status === 429)
    return "文字起こしサービスが混み合っています。少し待ってからもう一度お試しください。";
  if (/insufficient_quota|billing|credit/i.test(body)) {
    return "文字起こしサービスの利用枠が不足しています。管理者に残高の追加を依頼してください。";
  }
  return "文字起こしに失敗しました。しばらくして再度お試しください。";
}

/**
 * 1人あたりの文字起こし回数の上限（1時間）。
 *
 * ここに置く理由: 録音の区切り数（lib/recording/config.ts）と必ず釣り合っていないといけない。
 * 別々の場所に書くと、片方だけ変えたときに「60分の会議の途中で枠が尽きる」ことになり、
 * 気づくのは会議の最中になる。両方から参照して、関係をテストで固定する。
 */
export const TRANSCRIBE_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };
