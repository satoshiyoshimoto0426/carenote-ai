/**
 * 点検（app/api/evaluate/route.ts）で、AI の返事を待てる上限の合計（ミリ秒）。
 * 処理の持ち時間（maxDuration 120秒）から、返事を作って返すための余裕を引いた値。
 */
export const EVALUATE_AI_BUDGET_MS = 115_000;

/**
 * AI を待てる残りの時間（ミリ秒）。PDF の読み込みと一時保管の削除（最長8秒・lib/blob/deleteTemp.ts）で使った分を
 * 差し引く。差し引かないと、削除が遅く AI も遅いときに合計が持ち時間を超え、時間切れの文も削除の警告も返る前に
 * 処理が打ち切られる（2026-09-25 独立審査）。どんなに使っていても 1秒は待つ。
 *
 * @param startedAt 処理を始めた時刻（Date.now()）
 * @param now いまの時刻（Date.now()）
 */
export function aiTimeoutMs(startedAt: number, now: number): number {
  return Math.max(1_000, EVALUATE_AI_BUDGET_MS - (now - startedAt));
}
