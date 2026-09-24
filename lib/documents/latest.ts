import type { CareDocumentMeta, CareDocumentStatus, CareDocumentType } from "@/types/document";

/**
 * 利用者一覧の「書類の種類ごとの最新日付」と「更新」の列を、読んだ行から作る（作り直し計画 U5）。
 *
 * なぜ別ファイルか: 決まり（下書きも数える・種類ごとに一番新しいものが勝つ・「更新」は利用者を登録した日とも比べる）を
 * DB とも画面とも切り離し、lib/documents/latest.test.ts で固定するため。ブラウザでも読めるよう、
 * サーバ専用のもの（lib/db・Supabase）を import しない。
 *
 * 何と繋がるか:
 *   材料 = lib/db/documents.ts の getLatestDocMeta（この職員が保存した書類だけ・created_by）と
 *          lib/db/clients.ts の getClients（範囲内の利用者）。
 *   使う側 = app/api/clients/latest-docs/route.ts（応答の形 LatestDocsResponse）。
 *   画面（利用者一覧の アセス／プラン／会議／経過／モニタ／更新 の列）は作り直しの後段で繋ぐ。
 */

/** ある利用者・ある種類で、一番新しい書類の日付と状態。 */
export interface LatestDoc {
  /** 保存した日時（DB の created_at そのまま。ISO 形式） */
  createdAt: string;
  /** 下書きも数えるので、画面が「下書き／承認済み」を出せるよう状態も持つ */
  status: CareDocumentStatus;
}

/** 利用者1人ぶんの日付の列。 */
export interface ClientLatestDocs {
  clientId: string;
  /** 種類ごとの一番新しい書類。保存した書類が無い種類は欄そのものが無い（画面は「—」） */
  latest: Partial<Record<CareDocumentType, LatestDoc>>;
  /** 「更新」= 一番新しい書類の日付と、利用者を登録した日のうち、新しい方（ISO 形式） */
  updatedAt: string;
}

/** GET /api/clients/latest-docs が 200 で返す形（並びは受け取った利用者の並びのまま）。 */
export interface LatestDocsResponse {
  clients: ClientLatestDocs[];
}

/**
 * 日時の文字を比べられる数にする。文字のまま比べないのは、同じ時刻でも「+09:00」と「Z」、
 * 小数点以下の桁数の違いで並びが狂うため。読めない日時は投げる ── 黙って飛ばすと、
 * 書類がある種類を「まだありません」と見せてしまう（入口は「日付を読み込めませんでした」にする）。
 */
function timeOf(iso: string): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) throw new Error(`日時として読めない値があります: ${iso}`);
  return t;
}

/**
 * 利用者ごとに、種類ごとの一番新しい書類と「更新」をまとめる。
 *
 * - 下書き（draft）も承認済み（approved）も同じように数える（「作った日」の列なので状態で選ばない）。
 * - 同じ日時の書類が2つあれば、先に来た行を残す（読み出しの並びは lib/db/documents.ts で固定してある）。
 * - 渡された利用者に無い id の行は出さない（読み出しでも範囲内の利用者だけに絞っているので、来るのは想定外。
 *   範囲の外の利用者の日付を返さないための念押し）。
 * - 書類が1つも無い利用者も、「更新」= 登録した日で必ず1行出す。
 *
 * @param clients 範囲内の利用者（getClients の結果。id と登録した日だけを使う）
 * @param rows この職員が保存した書類の行（getLatestDocMeta の結果）
 * @throws Error 日時として読めない値があったとき
 */
export function summarizeLatestDocs(
  clients: readonly { id: string; createdAt: string }[],
  rows: readonly CareDocumentMeta[],
): ClientLatestDocs[] {
  const newest = new Map<string, Map<CareDocumentType, { doc: LatestDoc; time: number }>>();
  for (const c of clients) newest.set(c.id, new Map());

  for (const row of rows) {
    const perType = newest.get(row.clientId);
    if (!perType) continue;
    const time = timeOf(row.createdAt);
    const current = perType.get(row.docType);
    if (!current || time > current.time) {
      perType.set(row.docType, { doc: { createdAt: row.createdAt, status: row.status }, time });
    }
  }

  return clients.map((c) => {
    const latest: Partial<Record<CareDocumentType, LatestDoc>> = {};
    let updatedAt = c.createdAt;
    let updatedTime = timeOf(c.createdAt);
    for (const [type, { doc, time }] of newest.get(c.id) ?? []) {
      latest[type] = doc;
      if (time > updatedTime) {
        updatedAt = doc.createdAt;
        updatedTime = time;
      }
    }
    return { clientId: c.id, latest, updatedAt };
  });
}
