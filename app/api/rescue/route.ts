import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { type NextRequest, NextResponse } from "next/server";
import { AliasLoadError, getClientAliases } from "@/lib/db/clients";
import {
  composePersonaNotes,
  generateRescueBundle,
  type RescuePersona,
} from "@/lib/generation/rescue";
import {
  composeIntakeNotes,
  generateIntake,
  INTAKE_DOC_TYPES,
  INTAKE_MEDIA_TYPES,
  type IntakeDocType,
  type IntakeDocument,
  type IntakeMediaType,
  type IntakeResult,
} from "@/lib/generation/rescueIntake";
import { PiiLeakError } from "@/lib/privacy/leakCheck";
import { maskPii } from "@/lib/privacy/maskPii";
import { createPiiVault, restoreDeep } from "@/lib/privacy/vault";

// 5帳票を依存順＋並列で生成するため、通常の生成より長めに確保する。
export const maxDuration = 300;

/** 提供書類（PDF）の件数上限。UI側の上限と一致させる（API契約）。 */
const MAX_SOURCE_DOCS = 5;

/**
 * 提供書類の合計サイズ上限（生バイト）。base64化で約1.33倍に膨らむため、
 * Claude API のリクエスト上限（32MB）を超えないよう余裕を持って 20MB とする。
 */
const MAX_TOTAL_DOC_BYTES = 20 * 1024 * 1024;

/** リクエストボディの sourceDocs 1件（Vercel Blob にアップロード済みの PDF または画像）。 */
interface SourceDoc {
  name: string;
  url: string;
  /** PDF か画像か（第6段）。不正値は 400 */
  contentType: IntakeMediaType;
  /** 職員が選んだ資料の種別（未指定は「その他」） */
  docType: IntakeDocType;
}

/**
 * sourceDocs のURLが Vercel Blob のものかを検証する（SSRF対策）。
 * クライアント指定のURLをサーバー側で fetch するため、自前の Blob ストア以外へは出さない。
 */
function isBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** ボディから sourceDocs を防御的に取り出す（形式不正は null＝400 で返す）。 */
function parseSourceDocs(value: unknown): SourceDoc[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_SOURCE_DOCS) return null;
  const docs: SourceDoc[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const { name, url, contentType, docType } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof url !== "string" || !isBlobUrl(url)) return null;
    // 形式は許可リストのみ（画像は image ブロック、PDF は document ブロックで AI へ渡す）
    const ct =
      typeof contentType === "string" && (INTAKE_MEDIA_TYPES as string[]).includes(contentType)
        ? (contentType as IntakeMediaType)
        : name.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : null;
    if (!ct) return null;
    const dt =
      typeof docType === "string" && (INTAKE_DOC_TYPES as string[]).includes(docType)
        ? (docType as IntakeDocType)
        : "その他";
    docs.push({ name, url, contentType: ct, docType: dt });
  }
  return docs;
}

/**
 * 救済モード: 1つの人物像メモ（＋任意のPDF提供書類・時系列）から、整合の取れた書類一式
 * （アセスメント・第1/2表・第4表・第5表・モニタリング）の下書きを生成する。
 * sourceDocs があれば Stage0 として generateIntake で統合読解し、結果を全帳票の入力に統合、
 * レスポンスの intake にも載せる。PDFは処理後に必ず del() で削除する（評価と同じ非保持原則）。
 * Webアプリ（Clerkログイン）専用。完成形まで埋める（印なし）方針＝救済モード限定の品質緩和
 * （吉本さん承認済み・SPEC §6.5 / §12）。出力は下書きであり、確定前に人間が事実と照合する。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  // 黒塗り（SPEC §7・docs/specs/call-pipeline.md §2.1）: 名簿置換→型置換→自己点検を maskPii で
  // 一括適用してからAIへ送る。残っていれば 422 で送信を中止（fail-closed）。
  // 第一の防御は「メモに実名を書かない」運用で、これはその安全網（登録外の実名は置換できない）。
  // 二枚方式（§2.5）: 型置換の元の値はリクエスト内の札入れが覚え、AIの返事で手元に戻す。
  // 名簿が読めなければ送らない（fail-closed）
  let aliases: Awaited<ReturnType<typeof getClientAliases>>;
  try {
    aliases = await getClientAliases(userId);
  } catch (e) {
    if (e instanceof AliasLoadError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const vault = createPiiVault();
  const str = (key: string): string | undefined =>
    typeof body[key] === "string" ? maskPii(body[key] as string, aliases, vault).text : undefined;

  let persona: RescuePersona;
  try {
    persona = {
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
  } catch (e) {
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    throw e;
  }

  const sourceDocs = parseSourceDocs(body.sourceDocs);
  if (sourceDocs === null) {
    return NextResponse.json(
      { error: `提供書類の指定が不正です（PDF・画像のアップロードは最大${MAX_SOURCE_DOCS}件）。` },
      { status: 400 },
    );
  }

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

  // 処理後に必ず削除する Blob URL（非保持原則。intake の成否に関わらず finally で del）。
  const blobUrls = sourceDocs.map((d) => d.url);

  try {
    let intake: IntakeResult | undefined;

    if (sourceDocs.length > 0) {
      // ── Stage0: Blob取得 → base64 → 統合読解（evaluate と同じ流儀） ──
      let totalBytes = 0;
      const docs: IntakeDocument[] = [];
      for (const doc of sourceDocs) {
        const resp = await fetch(doc.url);
        if (!resp.ok) {
          throw new Error(`資料「${doc.name}」の取得に失敗しました（${resp.status}）。`);
        }
        const arrayBuffer = await resp.arrayBuffer();
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
          name: doc.name,
          base64: Buffer.from(arrayBuffer).toString("base64"),
          mediaType: doc.contentType,
          docType: doc.docType,
        });
      }
      const raw = await generateIntake(docs, persona);
      // 読み取り結果の文章すべてに黒塗りを適用（資料由来の実名・番号が下流プロンプトへ流れる穴を塞ぐ）
      const m = (s: string) => maskPii(s, aliases, vault).text;
      intake = {
        summary: m(raw.summary),
        cautions: raw.cautions.map(m),
        facts: raw.facts.map((f) => ({ ...f, text: m(f.text), source: m(f.source) })),
        conflicts: raw.conflicts.map((c) => ({
          topic: m(c.topic),
          advice: m(c.advice),
          statements: c.statements.map((s) => ({ source: m(s.source), text: m(s.text) })),
        })),
        documents: raw.documents.map((d) => ({ ...d, name: m(d.name) })),
      };
    }

    // 第6段: 分類別の事実メモ（出典つき・食い違いは冒頭）を帳票生成の入力にする
    const bundle = await generateRescueBundle(
      persona,
      intake ? composeIntakeNotes(intake) : undefined,
    );
    // AIの返事に残る札（〔電話番号1〕等）を手元で元の値に戻してから返す（名前の記号はそのまま）
    return NextResponse.json(restoreDeep(intake ? { ...bundle, intake } : bundle, vault));
  } catch (e: unknown) {
    // 読解サマリの黒塗りで実名が残った場合も 422（fail-closed）。原文はログに出さない
    if (e instanceof PiiLeakError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[rescue] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // ── Blob削除（個人情報保護・成功/失敗を問わず必ず） ──
    if (blobUrls.length > 0) {
      await del(blobUrls).catch((e) => console.error("[rescue] blob delete:", e));
    }
  }
}
