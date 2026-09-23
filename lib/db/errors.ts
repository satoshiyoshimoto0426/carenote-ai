/**
 * DB（Supabase）への問い合わせが失敗したことを、「0件・見えない・空」と分けて伝えるための部品。サーバ専用。
 *
 * なぜ存在するか（2026-09-24 検収の指摘・steering-log「DB の失敗を『無い・空』と答えていた」）:
 *   lib/db の関数は、DB の失敗を null・[]・false で返すことが多かった。入口はそれを「見つかりません」
 *   「まだありません」と言い換え、職員はいる利用者を登録し直したり、残っている記録を「無い」と思ったりした。
 *   同じ種類の不具合を 3 回踏んだ（2026-09-18 文字起こしの表が無いのを「権限がありません」・U0 の
 *   getClients の []・S1 の getClientById の null）。1か所ずつ直すと次の関数で再発するので、
 *   ここに共通の例外と判定を置き、lib/db のどの関数も同じ形で失敗を投げる。
 *
 * 決まり（CLAUDE.md「lib/db の読み書き」と同じ）:
 *   - 0件は 0件として返す（null・[]・false）。1件を読むときは 0件をエラーにしない maybeSingle を使う
 *     （single() は 0件にもエラー PGRST116 を返すので、「無い」と「DB の失敗」を分けられない）。
 *   - uuid の形でない id（SQLSTATE 22P02）はどの行にも当たらないので 0件と同じ扱い（isMalformedIdError）。
 *   - それ以外の失敗は DbAccessError（か、その子）を投げる。入口は 503 と publicMessage を返す。
 *
 * 何と繋がるか:
 *   使う側 = lib/db.ts・lib/db/{clients,documents,transcripts}.ts（ClientLookupError はこの子）。
 *   受ける側 = app/api/ の入口（instanceof DbAccessError → 503 と e.publicMessage）。
 *   見張り = lib/db/dbFailures.test.ts（どの問い合わせを1つ失敗させても、関数が「無い・空」と答えないこと）。
 */

/**
 * DB への問い合わせが失敗した（0件・見えない、とは別）。
 * message は DB の詳しい理由（サーバのログ用）、publicMessage は職員に見せる文（画面用）。
 * 入口は publicMessage だけを 503 で返し、message は画面へ出さない。
 */
export class DbAccessError extends Error {
  /** 職員に見せる文。「見つかりません」「ありません」とは言わない（言うと、あるものを作り直させる） */
  readonly publicMessage: string;

  constructor(detail: string, publicMessage: string) {
    super(detail);
    this.name = "DbAccessError";
    this.publicMessage = publicMessage;
  }
}

/** 待てば直ることが多いので、待ってからやり直すことと、直らないときの連絡先を伝える結び。 */
export const DB_RETRY_ADVICE =
  "少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。";

/**
 * 職員に見せる「読めなかった・書けなかった」の文を作る（何が起きたか＋DB_RETRY_ADVICE）。
 * @param what 何ができなかったか（例: 「保存した書類を読み込めませんでした。」）
 */
export function dbFailedMessage(what: string): string {
  return `${what}${DB_RETRY_ADVICE}`;
}

/** PostgREST が返す失敗の形（使う欄だけ）。 */
export interface PostgrestFailure {
  code?: string;
  message?: string;
}

/**
 * PostgreSQL の invalid_text_representation（SQLSTATE 22P02）。uuid の列に uuid の形でない id を渡すと返る。
 * そういう id はどの行にも当たらないので、DB の失敗ではなく 0件として扱う
 * （以前から URL に壊れた id が来たら 404 だった。その答えを変えない）。
 */
export function isMalformedIdError(error: PostgrestFailure | null): boolean {
  return error?.code === "22P02";
}

/**
 * DB の失敗をサーバのログへ残し、投げる例外を作る（呼ぶ側が throw する）。
 * ログにも例外の message にも、行の中身（本文・実名）は入れない ── 入れるのは関数名と DB のコード・理由だけ。
 * @param label どの関数か（例: 「getDocumentsByClient」）
 * @param error PostgREST が返した失敗
 * @param publicMessage 職員に見せる文（dbFailedMessage で作る）
 */
export function dbAccessError(
  label: string,
  error: PostgrestFailure,
  publicMessage: string,
): DbAccessError {
  const detail = `${label}: ${error.code ?? ""} ${error.message ?? ""}`.trim();
  console.error("[db]", detail);
  return new DbAccessError(detail, publicMessage);
}
