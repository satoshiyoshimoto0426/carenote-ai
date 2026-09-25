/**
 * /api/rescue が受け取る「提供書類（sourceDocs）」の検証。純粋ロジック（テスト対象）。
 *
 * なぜ存在するか:
 *   ルート内の非公開関数だったため、SSRF 許可リストを消してもテストが緑のままだった
 *   （独立審査 2026-09-11 critical #5）。lib に出して単体テストで固定する。
 *
 * 何と繋がるか:
 *   app/api/rescue/route.ts が parseSourceDocs を呼ぶ。許可形式・種別は lib/generation/intakeTypes.ts。
 */
import {
  INTAKE_DOC_TYPES,
  INTAKE_MEDIA_TYPES,
  type IntakeDocType,
  type IntakeMediaType,
} from "@/lib/generation/intakeTypes";

/** 提供書類の件数上限。UI側の上限と一致させる（API契約）。 */
export const MAX_SOURCE_DOCS = 5;

/** リクエストボディの sourceDocs 1件（Vercel Blob にアップロード済みの PDF または画像）。 */
export interface SourceDoc {
  name: string;
  url: string;
  /** PDF か画像か（第6段）。不正値は 400 */
  contentType: IntakeMediaType;
  /** 職員が選んだ資料の種別（未指定は「その他」） */
  docType: IntakeDocType;
}

/**
 * sourceDocs のURLが Vercel Blob の非公開ストアのホスト（https・*.private.blob.vercel-storage.com）のものかを検証する（SSRF対策）。
 * クライアント指定のURLをサーバー側で読むため、このホスト以外へは出さない。ストアの ID までは確かめない（他人の非公開ストアの
 * URL も形としては通る。読み書きは自分のストアの鍵でしかできない）。
 * https のみ・ホストは **非公開ストア**（*.private.blob.vercel-storage.com）に限る（D6・2026-09-12）。
 * 公開ストアの URL は受け付けない（原本を公開の場所に置かない約束を入口で守る）。
 */
export function isBlobUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && hostname.endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** ボディから sourceDocs を防御的に取り出す（形式不正は null＝400 で返す）。 */
export function parseSourceDocs(value: unknown): SourceDoc[] | null {
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

/** 元ファイル名から、URL に出しても安全な拡張子だけを取り出す（英数字のみ・無ければ bin） */
export function safeExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "bin";
  const ext = filename
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext && ext.length <= 8 ? ext : "bin";
}

/**
 * 資料の指定の中から、非公開ストアのホスト（*.private.blob.vercel-storage.com ── isBlobUrl）の URL だけを拾う
 * （parseSourceDocs が null を返した不正な指定でも使う）。ストアの ID までは確かめない（isBlobUrl と同じ）。
 * なぜ: 1件だけ種類が不正でも全体が 400 になり、正しく上げた他の資料が一時保管に残っていた（2026-09-25 独立審査）。
 *   400 を返す前にこれで拾って消す（app/api/rescue/route.ts）。
 * 拾うのは先頭の MAX_SOURCE_DOCS 件まで（画面はそれ以上上げない。多すぎる指定のために消す件数を増やさない）。
 */
export function blobUrlsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SOURCE_DOCS).flatMap((item) => {
    const url =
      typeof item === "object" && item !== null ? (item as Record<string, unknown>).url : undefined;
    return typeof url === "string" && isBlobUrl(url) ? [url] : [];
  });
}
