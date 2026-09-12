import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { type NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

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
        //    SDK 2.3 の onBeforeGenerateToken は access を返せないため、ここでは強制できない。
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
