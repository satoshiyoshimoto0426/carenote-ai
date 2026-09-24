/**
 * API の入口が受け取る本文（JSON）の読み方を1か所に置く。サーバの入口（app/api/）から使う。
 *
 * なぜ必要か（2026-09-24 検収の指摘・作り直し計画 S1）:
 *   `await req.json()` は、本文が JSON の `null`・配列・文字列・数値でも例外を投げずにその値を返す。
 *   各入口は結果をオブジェクトとみなして `body.clientId` のように読んでいたため、本文が `null` だと
 *   TypeError になり、入口は JSON の無い 500 を返していた（書き込みや AI への送信は起きていなかった）。
 *   同じ書き方が 10 の入口にあったので、写して直すのではなく、ここへまとめる。
 *   同じ日の検収で、直接読んでいた blob-upload（try の外で読み、壊れた JSON は JSON の無い 500）と evaluate も寄せた。
 *
 * 使う入口（JSON の本文を読む 12）: app/api/{clients, clients/[id]/related, documents, documents/[id], transcripts,
 *   generate, preview, kaipoke/assessment, rescue, extension/generate, blob-upload, evaluate}/route.ts。
 *   JSON でない本文（/api/transcribe の音声 formData）はここを通らない。
 * 入口ごとの 400 は tests/api/entryErrors.route.test.ts、ここの判定は lib/requestBody.test.ts が縛る。
 */

/** 本文を読めなかった・オブジェクトでなかったときに、入口が 400 で返す職員向けの言葉（以前からの文言のまま）。 */
export const REQUEST_PARSE_ERROR_MESSAGE = "リクエストの解析に失敗しました。";

/**
 * 本文を JSON として読み、**オブジェクト（`{...}`）のときだけ**返す。
 * JSON として読めない・`null`・配列・文字列・数値・真偽値のときは null を返す（例外は投げない）。
 * 呼ぶ側は null なら REQUEST_PARSE_ERROR_MESSAGE で 400 を返し、DB にも AI にも触らない。
 * 欄の中身（型・必須かどうか）は、ここでは見ない ── それぞれの入口が確かめる。
 */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}
