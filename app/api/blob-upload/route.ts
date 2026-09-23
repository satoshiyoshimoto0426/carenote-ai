import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { type NextRequest, NextResponse } from "next/server";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";

/**
 * 資料（PDF・画像）を非公開の Vercel Blob へ画面から直接上げるための、アップロード用の札を出す入口。
 * 呼ぶ画面: 救済モード（app/(dashboard)/rescue）と点検（app/(dashboard)/evaluate）の upload()。
 * 上げた資料は /api/rescue・/api/evaluate が読み、処理の後で必ず消す。
 *
 * 本文は lib/requestBody.ts の readJsonObject で読む（2026-09-24 検収の指摘）。以前は try の外で
 * `await request.json()` を呼んでいたので、JSON として読めない本文は JSON の無い 500 になり、JSON の null は
 * handleUpload の中の TypeError（内部の文言つきの 400）になっていた。オブジェクトでなければ 400 と決まった文で返す。
 * type（札を出す／上げ終わった）と payload の形を isUploadBody で確かめ、合わなければ同じ 400 にする。
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (!body || !isUploadBody(body)) {
    return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        // 第6段（OCR統合）: 紙の書類をスマホで撮った画像も受け付ける。処理後に削除する運用は PDF と同じ
        allowedContentTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        maximumSizeInBytes: 30 * 1024 * 1024, // 30MB
        // URL を推測できないように乱数を付ける（独立審査 2026-09-11 critical #6: 公開ストアは URL を知る誰でも読める）。
        // 画面側も元ファイル名を使わず拡張子だけの名前で上げる（実名入りファイル名を URL に出さない）
        addRandomSuffix: true,
        // ※ 非公開／公開はストア単位で決まる（接続中のストアは非公開 carenote-intake-private・D6）。
        //    SDK 2.3.0 の onBeforeGenerateToken の戻り値型は Pick<GenerateClientTokenOptions,
        //    'allowedContentTypes'|'maximumSizeInBytes'|'validUntil'|'addRandomSuffix'|'allowOverwrite'|'cacheControlMaxAge'|'ifMatch'>
        //    （node_modules/@vercel/blob/dist/client.d.ts:298）で access を含まないため、ここでは強制できない。
        //    画面側の upload() は access: "private" を渡す（ストアと食い違うとアップロード自体が失敗する）。
      }),
      onUploadCompleted: async () => {
        // 削除は /api/rescue・/api/evaluate が処理後に行うため、ここでは何もしない。
        // ※ このコールバックは Vercel から Clerk セッション無しで来るため middleware に弾かれるが、何もしないので実害なし
        //    （独立審査 D31）。使う時は middleware の公開経路にし、handleUpload の署名検証に任せる。
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

/**
 * @vercel/blob の handleUpload が受け取る本文の形か（type が2種類のどちらかで、payload がオブジェクト）。
 * 型を言い張る（as）のではなく実際に確かめてから渡す。中身の細部は handleUpload が確かめる。
 */
function isUploadBody(v: unknown): v is HandleUploadBody {
  if (typeof v !== "object" || v === null || !("type" in v) || !("payload" in v)) return false;
  const known = v.type === "blob.generate-client-token" || v.type === "blob.upload-completed";
  return known && typeof v.payload === "object" && v.payload !== null;
}
