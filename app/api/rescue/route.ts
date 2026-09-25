import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { deleteTempBlobs } from "@/lib/blob/deleteTemp";
import { readPrivateBlob } from "@/lib/blob/readPrivate";
import {
  AliasLoadError,
  type DataScope,
  getClientAliases,
  resolveScope,
  SCOPE_ERROR_MESSAGE,
} from "@/lib/db/clients";
import {
  composePersonaNotes,
  generateRescueBundle,
  type RescuePersona,
} from "@/lib/generation/rescue";
import {
  composeIntakeNotes,
  generateIntake,
  type IntakeDocument,
  type IntakeResult,
} from "@/lib/generation/rescueIntake";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskDeep } from "@/lib/privacy/maskBody";
import { maskPii } from "@/lib/privacy/maskPii";
import { createPiiVault, restoreDeep } from "@/lib/privacy/vault";
import { REQUEST_PARSE_ERROR_MESSAGE, readJsonObject } from "@/lib/requestBody";
import { blobUrlsIn, MAX_SOURCE_DOCS, parseSourceDocs } from "@/lib/rescue/sourceDocs";

// 5帳票を依存順＋並列で生成するため、通常の生成より長めに確保する。
export const maxDuration = 300;

/**
 * 提供書類の合計サイズ上限（生バイト）。base64化で約1.33倍に膨らむため、
 * Claude API のリクエスト上限（32MB）を超えないよう余裕を持って 20MB とする。
 */
const MAX_TOTAL_DOC_BYTES = 20 * 1024 * 1024;

/**
 * 救済モード: 1つの人物像メモ（＋任意のPDF提供書類・時系列）から、整合の取れた書類一式
 * （アセスメント・第1/2表・第4表・第5表・モニタリング）の下書きを生成する。
 * sourceDocs があれば Stage0 として generateIntake で統合読解し、結果を全帳票の入力に統合、
 * レスポンスの intake にも載せる。資料（PDF・画像）は読み込んだ直後、AI へ送る前に削除する（評価と同じ非保持原則）。
 * Webアプリ（Clerkログイン）専用。完成形まで埋める（印なし）方針＝救済モード限定の品質緩和
 * （吉本さん承認済み・SPEC §6.5 / §12）。出力は下書きであり、確定前に人間が事実と照合する。
 *
 * 削除の順序（独立審査 2026-09-11 D20・2026-09-25）: 本文を読んだら、資料の指定が不正でも非公開ストアのホストの URL を拾い
 * （blobUrlsIn）、以後の返事はすべて respond() を通す。respond() は返事を作る**前に**消し、失敗・時間切れなら warnings を
 * 返事に載せる（lib/blob/deleteTemp.ts）。資料を読み込めたら AI へ送る前に消すので、生成の途中で打ち切られても残らない。
 * 削除しない返事: 401（ログインしていない人の指定では消さない）と、本文が読めない 400（URL が分からない）。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  const sourceDocs = parseSourceDocs(body.sourceDocs);
  // 削除する Blob URL（非保持原則）。指定が不正でも、非公開ストアのホストの URL は拾って消す（残さない）
  const blobUrls = sourceDocs ? sourceDocs.map((d) => d.url) : blobUrlsIn(body.sourceDocs);
  /** 一時保管の削除に失敗したときの警告。以後の返事すべてに載せる（黙って残さない・独立審査 D27） */
  const warnings: string[] = [];
  /** まだ消していない一時保管を消し、失敗なら warnings に積む（2回目以降は対象が空なので何もしない） */
  const deleteNow = async () => {
    warnings.push(...(await deleteTempBlobs(blobUrls.splice(0, blobUrls.length), "rescue")));
  };
  /**
   * 返事を作る前に一時保管を消し、削除の失敗を warnings として返事に載せる。
   * 以前は失敗の返事を作った後の finally で消していたため、失敗の返事には警告が載らなかった（2026-09-25）。
   */
  const respond = async (payload: object, status = 200) => {
    await deleteNow();
    return NextResponse.json(warnings.length > 0 ? { ...payload, warnings } : payload, { status });
  };

  if (sourceDocs === null) {
    return await respond(
      { error: `提供書類の指定が不正です（PDF・画像のアップロードは最大${MAX_SOURCE_DOCS}件）。` },
      400,
    );
  }

  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return await respond({ error: SCOPE_ERROR_MESSAGE }, 503);
  }

  try {
    // 黒塗り（SPEC §7・docs/specs/call-pipeline.md §2.1）: 名簿置換→型置換→自己点検を maskPii で
    // 一括適用してからAIへ送る。残っていれば 422 で送信を中止（fail-closed）。
    // 第一の防御は「メモに実名を書かない」運用で、これはその安全網（登録外の実名は置換できない）。
    // 二枚方式（§2.5）: 型置換の元の値はリクエスト内の札入れが覚え、AIの返事で手元に戻す。
    // 名簿が読めなければ送らない（fail-closed）
    let aliases: Awaited<ReturnType<typeof getClientAliases>>;
    try {
      aliases = await getClientAliases(scope);
    } catch (e) {
      if (e instanceof AliasLoadError) return await respond({ error: e.message }, 503);
      throw e;
    }
    const vault = createPiiVault();
    const str = (key: string): string | undefined =>
      typeof body[key] === "string" ? maskPii(body[key] as string, aliases, vault).text : undefined;

    const persona: RescuePersona = {
      clientInfo: str("clientInfo"),
      personality: str("personality"),
      lifeHistory: str("lifeHistory"),
      medical: str("medical"),
      physicalCognitive: str("physicalCognitive"),
      familyHousing: str("familyHousing"),
      currentServices: str("currentServices"),
      intentions: str("intentions"),
      timeline: str("timeline"),
      additionalNotes: str("additionalNotes"),
    };

    // 「人物像1項目以上 or 提供書類1件以上」で生成可（資料だけでも生成できる）。
    if (!composePersonaNotes(persona).trim() && sourceDocs.length === 0) {
      return await respond(
        {
          error:
            "利用者の人物像（性格・生活歴・診断など）を1つ以上入力するか、資料（PDF・画像）を添付してください。",
        },
        400,
      );
    }

    let intake: IntakeResult | undefined;

    if (sourceDocs.length > 0) {
      // ── Stage0: Blob取得 → base64 → 統合読解（evaluate と同じ流儀） ──
      let totalBytes = 0;
      const docs: IntakeDocument[] = [];
      for (const doc of sourceDocs) {
        // 非公開ストアなので fetch ではなく認証つきの get() で読む
        const arrayBuffer = await readPrivateBlob(doc.url);
        if (!arrayBuffer) {
          throw new Error("資料の取得に失敗しました（一時保管に見つかりません）。");
        }
        totalBytes += arrayBuffer.byteLength;
        if (totalBytes > MAX_TOTAL_DOC_BYTES) {
          return await respond(
            {
              error:
                "資料の合計サイズが大きすぎます（合計20MBまで）。ページ数の少ないPDFや、枚数を減らした写真でお試しください。",
            },
            413,
          );
        }
        docs.push({
          // ファイル名も黒塗りを通す（職員の端末上の名前に実名が入ることがある・独立審査 D7/D21）
          name: maskPii(doc.name, aliases, vault).text,
          base64: Buffer.from(arrayBuffer).toString("base64"),
          mediaType: doc.contentType,
          docType: doc.docType,
        });
      }
      // 読み込んだら、AI へ送る前にすぐ消す（すみやかに削除。この後で時間切れに打ち切られても残らない ── 2026-09-25 独立審査）
      await deleteNow();
      const raw = await generateIntake(docs, persona);
      // 読み取り結果の文章すべてに黒塗りを適用（資料由来の実名・番号が下流プロンプトへ流れる穴を塞ぐ）
      intake = maskDeep(raw, aliases, vault);
    }

    // 第6段: 分類別の事実メモ（出典つき・食い違いは冒頭）を帳票生成の入力にする
    const bundle = await generateRescueBundle(
      persona,
      intake ? composeIntakeNotes(intake) : undefined,
    );
    // AIの返事に残る札（〔電話番号1〕等）を手元で元の値に戻してから返す（名前の記号はそのまま）
    const result = restoreDeep(intake ? { ...bundle, intake } : bundle, vault);
    return await respond(result);
  } catch (e: unknown) {
    // 読解サマリの黒塗りで実名が残った場合も 422（fail-closed）。原文はログに出さない
    if (e instanceof PiiLeakError) {
      return await respond({ error: e.message }, 422);
    }
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[rescue] error:", message);
    return await respond({ error: message }, 500);
  } finally {
    // ── 安全網: respond() を通らずに抜けた場合も一時保管を残さない。ここで消す物があるのは配線の誤り
    //    （警告が返事に載らない）なので、記録に残して気づけるようにする ──
    if (blobUrls.length > 0) {
      console.error(
        "[rescue] respond() を通らずに返した経路がある（一時保管の削除の警告が返事に載らない）",
      );
      await deleteNow();
    }
  }
}
