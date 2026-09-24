import { DOC_ORDER } from "@/lib/create/docTypes";
import type { CareDocumentRecord, CareDocumentType } from "@/types/document";

/**
 * 利用者の画面の「書類」の行を組み立てる、画面を持たない決まり（A案「作業台」A6 ＝ 計画 U3b）。
 *
 * なぜ存在するか:
 *   以前は保存した書類を**全部**1行ずつ並べていた（同じ種類を3回保存すると3行）。A案（アートボード A-clients）では
 *   **書類の種類ごとに1行**（いちばん新しい版の日付・状態・「開く」）にする。ただし古い版を画面から消すと、
 *   承認した版や以前の版を二度と開けなくなる ── そこで古い版は「以前の版（n）」の中に必ず残す。
 *   その振り分け（新しい順・種類ごと・どの版も落とさない）を、画面を描かずに確かめられるようここに置く
 *   （テスト: lib/clients/documentRows.test.ts）。
 *
 * 読む側: components/clients/ClientPane.tsx。書類の種類の並び順は lib/create/docTypes.ts の DOC_ORDER。
 * 書類は作った職員の分だけが届く（GET /api/clients/{id} → lib/db/documents.ts getDocumentsByClient の created_by）。
 */

/** 書類の種類1つぶんの行。 */
export interface DocTypeRow {
  type: CareDocumentType;
  /** いちばん新しい版（まだ無ければ null ＝「まだありません」と「つくる」を出す）。 */
  latest: CareDocumentRecord | null;
  /** それより前の版（新しい順）。「以前の版（n）」の中に並べる。 */
  older: CareDocumentRecord[];
}

/** 振り分けた結果。 */
export interface DocumentRows {
  /** DOC_ORDER の5種類（書類が無い種類も必ず1行ある）。 */
  rows: DocTypeRow[];
  /**
   * DOC_ORDER に無い種類の書類（新しい順）。保存の入口（app/api/documents/route.ts の ALLOWED_TYPES）が
   * 5種類に絞っているので、ふつうは空。DB の列に決まりは無いので、万一あっても画面から消さないために分けて返す。
   */
  others: CareDocumentRecord[];
}

/** 保存日時の数値（読めない日時は一番古い扱いにする ── 並びが崩れても書類そのものは落とさない）。 */
function timeOf(doc: CareDocumentRecord): number {
  const t = Date.parse(doc.createdAt);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/**
 * 保存した書類を、種類ごとの行（いちばん新しい版＋以前の版）に振り分ける。
 * 並びは保存日時の新しい順（同じ日時は受け取った順のまま）。受け取った配列は変えない。
 * **どの書類も必ずどこか1か所に入る**（latest・older・others のどれか）。
 */
export function groupDocumentsByType(documents: readonly CareDocumentRecord[]): DocumentRows {
  const sorted = [...documents].sort((a, b) => timeOf(b) - timeOf(a));
  const known = new Set<string>(DOC_ORDER);
  const rows = DOC_ORDER.map((type) => {
    const ofType = sorted.filter((doc) => doc.docType === type);
    return { type, latest: ofType[0] ?? null, older: ofType.slice(1) };
  });
  const others = sorted.filter((doc) => !known.has(doc.docType));
  return { rows, others };
}
