/**
 * 文字起こし全文を保存するときの入力チェック（純粋ロジック・テスト対象）。
 *
 * なぜ存在するか:
 *   ここに保存するものは**黒塗りが効かない生の個人情報**（会議に出た全員の実名が入る）。
 *   だからこそ「何を保存したか」を後から言えるようにしておく必要があり、
 *   種類・見出し・長さの決まりをサーバ側で固定する。画面の言うことは信用しない。
 *
 * 見出し（title）について:
 *   一覧に出るのは見出しだけなので、ここに実名を書くと**暗号化していない場所に実名が残る**。
 *   運用で「実名を書かない」とお願いしたうえで、機械でも長さを絞り、改行や制御文字を落とす。
 *   ただし**実名かどうかの判定はできない**（できるふりをしない）。
 *
 * 何と繋がるか:
 *   使う側 = app/api/transcripts/route.ts → lib/db/transcripts.ts（暗号化して保存）
 *   仕様   = docs/specs/recording-pipeline.md R4
 */

/** 文字起こしの種類。画面の帳票タブと、電話（call）に対応する。 */
export const TRANSCRIPT_KINDS = ["assessment", "meeting", "monitoring", "support", "call"] as const;
export type TranscriptKind = (typeof TRANSCRIPT_KINDS)[number];

/** 見出しの上限。一覧で1行に収まる長さ。 */
export const TITLE_MAX_CHARS = 40;

/**
 * 全文の上限。
 * 60分の会議で 2万字前後。3倍の余裕を見て6万字にする。これを超えるものは、
 * 会議の記録ではなく何かの取り違え（貼り間違い・繰り返し送信）と考えて断る。
 */
export const TEXT_MAX_CHARS = 60_000;

export type TranscriptCheck =
  | { ok: true; kind: TranscriptKind; title: string; text: string }
  | { ok: false; reason: string };

const KIND_LABELS: Record<TranscriptKind, string> = {
  assessment: "アセスメント",
  meeting: "担当者会議",
  monitoring: "モニタリング",
  support: "支援経過",
  call: "電話",
};

/** 画面に出す種類の名前。 */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind as TranscriptKind] ?? kind;
}

/** 見出しから改行・制御文字を落とし、長さを絞る。 */
export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // 制御文字は Unicode の分類（Cc）で消す。コード番号を直接書くと整形で実体の文字に
  // 変わってしまい、ソースに見えない文字が紛れる（check-invisible が検出・2026-09-17）
  const flat = raw.replace(/\p{Cc}/gu, " ").trim();
  return flat.slice(0, TITLE_MAX_CHARS);
}

/** 保存してよい入力か判定する。画面から来た値は信用せず、ここで必ず通す。 */
export function checkTranscriptInput(body: {
  kind?: unknown;
  title?: unknown;
  text?: unknown;
}): TranscriptCheck {
  const kind = body.kind;
  if (typeof kind !== "string" || !(TRANSCRIPT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, reason: "保存する種類が正しくありません。" };
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) return { ok: false, reason: "保存する文字起こしがありません。" };
  if (text.length > TEXT_MAX_CHARS) {
    return {
      ok: false,
      reason: `文字起こしが長すぎます（上限 ${TEXT_MAX_CHARS.toLocaleString("ja-JP")}字）。会議を分けて保存してください。`,
    };
  }
  return { ok: true, kind: kind as TranscriptKind, title: normalizeTitle(body.title), text };
}
