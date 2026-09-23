import type { ClientRecord } from "@/types/client";

/**
 * 利用者一覧（GET /api/clients）を読めなかったときの、言葉と読み出し方を1か所に置く。
 *
 * なぜ必要か（2026-09-23 作り直し計画 U0・検収の指摘）:
 *   以前は DB が読めないと一覧 API が空の配列 [] を返していた。画面は「まだ利用者がいません」と
 *   出し、救済モードの保存では選べる行き先が「新しい利用者として保存」だけになって、
 *   **同じ方を黙って二重に登録**できてしまった（横断規約 §2.7-B②「動いてるふり」）。
 *   二重登録は記録を2か所に分けるうえ、氏名の空白の有無など表記だけが違うと、名簿の安全網
 *   （lib/privacy/pseudonymize.ts の expandAliasVariants）が別人とみなして事業所全体の送信を止める。
 *
 * 何と繋がるか:
 *   - サーバ: app/api/clients/route.ts が失敗時に CLIENT_LIST_LOAD_FAILED_MESSAGE を 500 で返す
 *   - 画面: lib/clients/useClientList.ts（SaveTranscriptBar・/rescue の保存パネル）と
 *     app/(dashboard)/clients/page.tsx が fetchClientList を通して読む
 *
 * このファイルはブラウザでも読むので、サーバ専用のもの（lib/db・Supabase）を import しない。
 */

/** 一覧を読めなかったとき、どの画面でも先頭に出す言葉（吉本さん決定 2026-09-23）。 */
export const CLIENT_LIST_ERROR_HEADLINE = "利用者一覧を読めませんでした";

/**
 * 一覧 API が DB を読めなかったときに返す、職員向けの文言（500 の本文）。
 * 通信が切れた・応答が一覧の形でない、のように理由が分からないときも画面はこれを出す。
 */
export const CLIENT_LIST_LOAD_FAILED_MESSAGE = `${CLIENT_LIST_ERROR_HEADLINE}。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。`;

/**
 * API が返した error の文を、先頭が必ず「利用者一覧を読めませんでした」になる形に整える。
 *
 * なぜ: 一覧 API は DB の失敗（500）のほかに、ログイン切れ（401）やログイン情報の形の異常（503・
 * SCOPE_ERROR_MESSAGE）でも止まる。その文言だけを出すと、職員には「何が読めなかったのか」が
 * 分からない。見出しを前に付け、API の文（直し方の案内）はそのまま後ろに残す。
 */
export function clientListErrorMessage(serverError: unknown): string {
  if (typeof serverError !== "string" || serverError.trim() === "") {
    return CLIENT_LIST_LOAD_FAILED_MESSAGE;
  }
  if (serverError.startsWith(CLIENT_LIST_ERROR_HEADLINE)) return serverError;
  return `${CLIENT_LIST_ERROR_HEADLINE}。${serverError}`;
}

/** fetchClientList の結果。読めなかったときは、画面にそのまま出せる文を持つ。 */
export type ClientListResult =
  | { ok: true; clients: ClientRecord[] }
  | { ok: false; message: string };

/**
 * GET /api/clients を読み、一覧か「読めなかった」かのどちらかにして返す（例外は投げない）。
 *
 * 空の一覧と「読めなかった」を取り違えないことが目的なので、次はすべて「読めなかった」にする:
 * 通信の失敗・200 以外・本文が JSON でない（ログイン画面の HTML など）・本文が配列でない。
 * 使う側: lib/clients/useClientList.ts・app/(dashboard)/clients/page.tsx。
 */
export async function fetchClientList(): Promise<ClientListResult> {
  let res: Response;
  try {
    res = await fetch("/api/clients");
  } catch {
    return { ok: false, message: CLIENT_LIST_LOAD_FAILED_MESSAGE };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const serverError =
      body !== null && typeof body === "object" && "error" in body
        ? (body as { error: unknown }).error
        : undefined;
    return { ok: false, message: clientListErrorMessage(serverError) };
  }
  if (!Array.isArray(body)) return { ok: false, message: CLIENT_LIST_LOAD_FAILED_MESSAGE };
  return { ok: true, clients: body as ClientRecord[] };
}
