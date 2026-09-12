/**
 * 非公開 Blob ストアから資料を読む（サーバ専用）。
 *
 * なぜ存在するか:
 *   吉本さん決定 D6（2026-09-12）: 主治医意見書・看護サマリー等の原本を置く一時保管を**非公開ストア**にした。
 *   非公開の URL は fetch では読めない（認証が要る）ため、`@vercel/blob` の get() を通す。
 *   /api/rescue と /api/evaluate の両方がここを使う（読み方を1か所に）。
 *
 * 何と繋がるか: lib/rescue/sourceDocs.isBlobUrl（許可ホスト＝非公開ストアのみ）→ ここで get() → base64 化して AI へ。
 */
import { get } from "@vercel/blob";

/** 非公開 Blob の中身をまとめて読む。無ければ null。 */
export async function readPrivateBlob(url: string): Promise<ArrayBuffer | null> {
  const result = await get(url, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).arrayBuffer();
}
