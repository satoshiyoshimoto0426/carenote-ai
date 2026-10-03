/**
 * 計画書の画面から API（/api/preview・/api/generate）へ JSON を送り、結果か「画面に出す日本語の失敗の文」を返す。
 *
 * なぜあるか: 失敗の文は職員がそのまま読む。サーバーが返す日本語の error（422＝名前が残っていて送れない・
 *   413＝長すぎる・402＝AI の利用枠 など）はそのまま出し、サーバーの文が無いとき（通信が切れた・
 *   Vercel が JSON でない返事を返した）も英語の「Failed to fetch」「Unexpected token」を出さずに日本語にする。
 * 何と繋がるか: 画面＝components/supportPlan/SupportPlanAWorkbench.tsx。受け手＝app/api/preview/route.ts・
 *   app/api/generate/route.ts（どちらも失敗は { error: "日本語の文" } で返す）。
 */

/** 通信そのものが失敗したとき（サーバーの返事が無いとき）の文 */
export const NETWORK_ERROR =
  "通信に失敗しました。インターネットにつながっているか確かめて、もう一度押してください。";

export type PostResult = { ok: true; data: unknown } | { ok: false; error: string };

/** サーバーの文が無い失敗（JSON でない返事）を、状態の番号から日本語にする */
function statusMessage(status: number): string {
  if (status === 413)
    return "送る文章が長すぎて、受け取れませんでした（413）。面談の文字起こしの要らない部分を削ってから、もう一度押してください。";
  if (status === 504)
    return "時間内に終わりませんでした（504）。少し待ってから、もう一度押してください。";
  return `サーバーの返事を読めませんでした（${status}）。ログインが切れていないか確かめて、少し待ってから、もう一度押してください。`;
}

/**
 * url へ body を JSON で送る。成功なら { ok: true, data }（中身の形は呼ぶ側が決める）、
 * 失敗なら { ok: false, error }（画面にそのまま出せる日本語）。例外は投げない。
 */
export async function postJson(
  url: string,
  body: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<PostResult> {
  let resp: Response;
  try {
    resp = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, error: statusMessage(resp.status) };
  }
  if (resp.ok) return { ok: true, data };
  const error =
    data && typeof data === "object" && "error" in data && typeof data.error === "string"
      ? data.error
      : "";
  return {
    ok: false,
    error: error.trim()
      ? error
      : `エラーが発生しました（${resp.status}）。もう一度押してください。`,
  };
}
