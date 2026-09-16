/**
 * 文字起こしの結果を、いまメモ欄にある文章へ足す（純粋ロジック・テスト対象）。
 *
 * なぜ切り出したか:
 *   足し方を間違えると、職員が書いたメモを**上書きして消す**。しかも消えたことは
 *   画面を見るまで分からない。画面の中に埋めておくとテストできないので、ここに出した。
 *   仕様: docs/specs/recording-pipeline.md R1。
 *
 * なぜ見出しを付けるか:
 *   手で書いたメモと機械が起こした文章が地続きだと、あとで「どこからが録音か」が分からない。
 *   第5表の支援経過では、この見出しがそのまま記録の出どころの手がかりになる。
 */

/** 録音から起こした部分の目印。画面・台本（MANUAL-VIDEO-SPEC ch4）と同じ文字。 */
export const TRANSCRIPT_HEADING = "【録音の文字起こし】";

/**
 * すでに書かれている文章の後ろへ、文字起こしを見出し付きで足す。
 * 空欄なら見出しを付けずにそのまま入れる（1回目は出どころが自明なため）。
 */
export function appendTranscript(previous: string, transcript: string): string {
  const add = transcript.trim();
  const before = previous.trim();
  if (!add) return previous;
  if (!before) return add;
  return `${before}\n\n${TRANSCRIPT_HEADING}\n${add}`;
}
