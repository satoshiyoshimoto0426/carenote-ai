import { del } from "@vercel/blob";

/**
 * 一時保管（非公開の Vercel Blob）の削除に失敗したとき、職員の画面に出す文。
 *
 * なぜあるか: 事業所向けのデータ取扱説明書（docs/DATA-HANDLING-EXPLANATION.md の「添付資料の非保持」）で
 *   「削除に失敗した時は画面に警告」と約束している。2026-09-25 まで、救済モードは成功の返事にだけ載せて画面が表示せず、
 *   点検はサーバーの記録に残すだけだった（管理書 T-DOC-02）。
 * 何と繋がるか: app/api/evaluate/route.ts・app/api/rescue/route.ts が返事の `warnings` に入れ、
 *   components/TempDeleteWarnings.tsx が点検と救済モードの画面に出す。
 */
export const TEMP_DELETE_FAILED_WARNING =
  "資料の一時保管の削除に失敗しました。管理者に Vercel Blob の該当ファイルの削除を依頼してください。";

/**
 * 削除を待つ上限（ミリ秒）。Blob の SDK（@vercel/blob 2.3.0）は通信の失敗や障害のとき最大10回やり直し、
 * あきらめて失敗を返すまで十数分かかりうる（2026-09-25 独立審査が SDK の中身から計算）。それを待つと、点検（120秒）・
 * 救済モード（300秒）の処理が時間切れで打ち切られ、警告も結果も届かない。上限を過ぎたら失敗として警告を返し、
 * 残りのやり直しは止める（abortSignal）。
 */
export const TEMP_DELETE_DEADLINE_MS = 8000;

/**
 * 一時保管を削除する。失敗・時間切れは握りつぶさず、画面に出す警告の文を返す（成功・対象なしは空の配列）。
 * 呼ぶ側は、資料をメモリに読み込んだ直後（AI へ送る前）と、返事を作る前に await し、
 * 返事の `warnings` として載せる（返事を作った後の finally で消すと、失敗が画面に届かない）。
 *
 * @param urls 削除する URL（1件か複数）。空文字・空配列なら何もしない。
 * @param tag サーバーの記録に付ける入口の名前（例 "evaluate"）。記録に出すのは入口の名前と失敗の理由の文
 *   （SDK・通信部品のエラーの文、または時間切れ）。こちらからは URL を記録に足さない（SDK のエラーの文の中身までは保証しない）。
 * @param deadlineMs 待つ上限（テスト用に変えられる）。
 */
export async function deleteTempBlobs(
  urls: string | string[],
  tag: string,
  deadlineMs: number = TEMP_DELETE_DEADLINE_MS,
): Promise<string[]> {
  if (urls.length === 0) return [];
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve("timeout");
    }, deadlineMs);
  });
  // 時間切れの後で削除が失敗しても、Promise.race が受け手になるので処理ごと落ちない（独立審査で実験済み）
  const deletion = del(urls, { abortSignal: controller.signal }).then(() => "done" as const);
  try {
    const outcome = await Promise.race([deletion, timedOut]);
    if (outcome === "timeout") {
      console.error(`[${tag}] blob delete: 時間切れ（${deadlineMs}ms）`);
      return [TEMP_DELETE_FAILED_WARNING];
    }
    return [];
  } catch (e) {
    console.error(`[${tag}] blob delete:`, e instanceof Error ? e.message : String(e));
    return [TEMP_DELETE_FAILED_WARNING];
  } finally {
    clearTimeout(timer);
  }
}
