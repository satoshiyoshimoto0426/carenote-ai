/**
 * 保持期間の算出（純粋ロジック）。
 * 介護記録の保存義務に合わせ、保持期間は 5 年（吉本決定 2026-06-16・機能仕様 §4）。
 * 期間経過後の自動削除ジョブはフェーズ2。
 */

/** 既定の保持年数。 */
export const RETENTION_YEARS = 5;

/** 起点日から保持期限（= 起点 + years 年）を返す。 */
export function computeRetentionUntil(from: Date, years: number = RETENTION_YEARS): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + years);
  return d;
}
