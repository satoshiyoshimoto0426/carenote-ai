import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
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
import { MAX_SOURCE_DOCS, parseSourceDocs } from "@/lib/rescue/sourceDocs";

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
 * レスポンスの intake にも載せる。PDFは処理後に必ず del() で削除する（評価と同じ非保持原則）。
 * Webアプリ（Clerkログイン）専用。完成形まで埋める（印なし）方針＝救済モード限定の品質緩和
 * （吉本さん承認済み・SPEC §6.5 / §12）。出力は下書きであり、確定前に人間が事実と照合する。
 *
 * 削除の順序（独立審査 2026-09-11 D20）: sourceDocs は本文解析の直後に確定し、以降の 400/422/503 も
 * すべて finally の del() を通る（原本を Blob に残さない）。
 */
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let scope: DataScope;
  try {
    scope = resolveScope(userId, orgId);
  } catch {
    return NextResponse.json({ error: SCOPE_ERROR_MESSAGE }, { status: 503 });
  }

  const body = await readJsonObject(req);
  if (!body) return NextResponse.json({ error: REQUEST_PARSE_ERROR_MESSAGE }, { status: 400 });

  const sourceDocs = parseSourceDocs(body.sourceDocs);
  if (sourceDocs === null) {
    return NextResponse.json(
      { error: `提供書類の指定が不正です（PDF・画像のアップロードは最大${MAX_SOURCE_DOCS}件）。` },
      { status: 400 },
    );
  }
  // 処理後に必ず削除する Blob URL（非保持原則。以降のどの return でも finally で del）。
  const blobUrls = sourceDocs.map((d) => d.url);
  /** 削除に失敗した時に画面へ伝える（黙って残さない・独立審査 D27） */
  const warnings: string[] = [];

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
      if (e instanceof AliasLoadError)
        return NextResponse.json({ error: e.message }, { status: 503 });
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
      return NextResponse.json(
        {
          error:
            "利用者の人物像（性格・生活歴・診断など）を1つ以上入力するか、資料（PDF・画像）を添付してください。",
        },
        { status: 400 },
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
          return NextResponse.json(
            {
              error:
                "資料の合計サイズが大きすぎます（合計20MBまで）。ページ数の少ないPDFや、枚数を減らした写真でお試しください。",
            },
            { status: 413 },
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
    await deleteBlobs(blobUrls, warnings);
    return NextResponse.json(warnings.length > 0 ? { ...result, warnings } : result);
  } catch (e: unknown) {
    // 読解サマリの黒塗りで実名が残った場合も 422（fail-closed）。原文はログに出さない
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[rescue] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // ── Blob削除（個人情報保護・成功/失敗を問わず必ず。成功経路で削除済みなら何もしない） ──
    await deleteBlobs(blobUrls, warnings);
  }
}

/** 資料の一時保管を削除する。失敗は握りつぶさず warnings に積む（呼び出し側が画面へ返す）。 */
async function deleteBlobs(urls: string[], warnings: string[]): Promise<void> {
  if (urls.length === 0) return;
  const targets = urls.splice(0, urls.length);
  try {
    await del(targets);
  } catch (e) {
    console.error("[rescue] blob delete:", e instanceof Error ? e.message : String(e));
    warnings.push(
      "資料の一時保管の削除に失敗しました。管理者に Vercel Blob の該当ファイルの削除を依頼してください。",
    );
  }
}
