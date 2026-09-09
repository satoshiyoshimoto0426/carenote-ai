/**
 * 漏れ検査（黒塗り後のテキストに個人情報が残っていないかの自己点検）。純粋ロジック。
 *
 * なぜ存在するか:
 *   黒塗りは「消したつもり」で終わらせない。AIへ送る直前にもう一度、登録実名と型を探し、
 *   1件でも残っていれば例外を投げて送信を止める（fail-closed。docs/specs/call-pipeline.md §2.1 ③）。
 *   テストでは「わざと実名を入れた文章を流して0件」を機械的に確かめる（§2.7-D 修復＝強化）。
 */

import { detectPatterns, type PiiKind } from "./patterns";
import type { NameAlias } from "./pseudonymize";

export interface LeakReport {
  /** 残っていた登録実名（2文字以上のみ判定対象。1文字は誤検知が多いため除外） */
  names: string[];
  /** 残っていた型（電話番号など） */
  patterns: PiiKind[];
}

/** 個人情報が残っていた時に投げる。message に原文は含めない。 */
export class PiiLeakError extends Error {
  readonly report: LeakReport;
  constructor(report: LeakReport) {
    super(
      `個人情報の置換に失敗したため送信を中止しました（実名${report.names.length}件・型${report.patterns.length}種）`,
    );
    this.name = "PiiLeakError";
    this.report = report;
  }
}

/** 黒塗り後のテキストを検査し、残っていた実名と型を返す。何も無ければ両方空。 */
export function findLeaks(text: string, aliases: NameAlias[]): LeakReport {
  const names = aliases
    .map((a) => a.real)
    .filter((real, i, arr) => real.length >= 2 && arr.indexOf(real) === i && text.includes(real));
  return { names, patterns: detectPatterns(text) };
}

/** 残っていれば PiiLeakError を投げる。呼び出し側は 422 に変換する。 */
export function assertNoLeak(text: string, aliases: NameAlias[]): void {
  const report = findLeaks(text, aliases);
  if (report.names.length > 0 || report.patterns.length > 0) {
    throw new PiiLeakError(report);
  }
}
