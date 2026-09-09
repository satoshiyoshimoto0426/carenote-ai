/**
 * AIへ送る直前の黒塗りの入口（名簿置換 → 型置換 → 自己点検）。純粋ロジック。
 *
 * なぜ存在するか:
 *   /api/generate と /api/rescue が個別に maskNames を呼ぶ形だと、型置換や漏れ検査の追加漏れが起きる。
 *   ここ1か所を通せば3段の黒塗りが必ずかかる（docs/specs/call-pipeline.md §2.1）。
 *   戻り値の findings は種類と件数のみ。原文をログへ出さないための設計。
 *
 * 二枚方式（§2.5）:
 *   型置換の元の値は札入れ（vault）が覚える。1リクエスト内の複数フィールドで同じ札入れを共有すると
 *   番号が衝突しない。AIの返事は restoreDeep(…, vault) で手元に戻す。
 *   名前（A様）は既存の「記号で保持」契約どおり戻さない（表示時の復元は第2段）。
 */
import { assertNoLeak } from "./leakCheck";
import { maskPatterns, type PatternFinding } from "./patterns";
import { maskNames, type NameAlias } from "./pseudonymize";
import { createPiiVault, type PiiVault } from "./vault";

export interface MaskResult {
  text: string;
  findings: {
    /** 名簿置換の件数（置換した箇所の数） */
    names: number;
    /** 型置換の種類と件数 */
    patterns: PatternFinding[];
  };
  /** 元の値を覚えている札入れ（ログ・DB・AIへ出さない） */
  vault: PiiVault;
}

/** 全角英数字・全角空白を半角へ揃える（「０９０−…」も電話番号として拾うため）。 */
function normalize(s: string): string {
  return s.normalize("NFKC");
}

/**
 * テキストを黒塗りして返す。登録実名や型が残っていれば PiiLeakError を投げる。
 * aliases は expandAliasVariants 済みを渡す（getClientAliases の戻り値）。
 * vault を渡すと同じ札入れを使い回す（複数フィールドで共有）。省略時は新しく作る。
 */
export function maskPii(text: string, aliases: NameAlias[], vault?: PiiVault): MaskResult {
  const v = vault ?? createPiiVault();
  const normalizedAliases = aliases.map((a) => ({ real: normalize(a.real), code: a.code }));
  const normalized = normalize(text);

  const afterNames = maskNames(normalized, normalizedAliases);
  const nameHits = countReplacements(normalized, normalizedAliases);

  const { text: afterPatterns, findings } = maskPatterns(afterNames, v);

  assertNoLeak(afterPatterns, normalizedAliases);
  return { text: afterPatterns, findings: { names: nameHits, patterns: findings }, vault: v };
}

/** 名簿置換の件数を数える（長い実名から順に、重複カウントを避けるため置換しながら数える）。 */
function countReplacements(text: string, aliases: NameAlias[]): number {
  let rest = text;
  let n = 0;
  for (const { real, code } of [...aliases].sort((a, b) => b.real.length - a.real.length)) {
    if (!real) continue;
    const parts = rest.split(real);
    n += parts.length - 1;
    rest = parts.join(code);
  }
  return n;
}
