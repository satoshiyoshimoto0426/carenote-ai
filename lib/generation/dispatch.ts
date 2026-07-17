import { generateAssessment } from "./assessment";
import { generateCarePlan } from "./carePlan";
import { generateMeetingSummary } from "./meetingSummary";
import { generateMonitoring } from "./monitoring";
import { generateSupportLog } from "./supportLog";

/** 入力検証エラー（HTTPステータス付き）。ルート側で status に変換する。 */
export class GenerateRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "GenerateRequestError";
  }
}

/** body から文字列フィールドを安全に取り出す（trim済み。無ければ空文字） */
function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 入力サイズの上限（コスト暴走・DoS対策・G3/R7 監査 High#1）。
 * 介護のメモは通常数千字。1フィールド4万字・合計6万字あれば実運用に十分で、
 * かつ Opus 最大課金を狙う巨大入力（数十万字）を止められる。超過は 413。
 */
const MAX_FIELD_CHARS = 40_000;
const MAX_TOTAL_CHARS = 60_000;

/** body 内の全文字列フィールドの長さを検査し、上限超過なら 413 を投げる。 */
function assertInputSize(body: Record<string, unknown>): void {
  let total = 0;
  for (const value of Object.values(body)) {
    if (typeof value !== "string") continue;
    if (value.length > MAX_FIELD_CHARS) {
      throw new GenerateRequestError(413, "入力が大きすぎます。文章を短くしてお試しください。");
    }
    total += value.length;
  }
  if (total > MAX_TOTAL_CHARS) {
    throw new GenerateRequestError(413, "入力全体が大きすぎます。文章を短くしてお試しください。");
  }
}

/**
 * リクエストボディから documentType を判定し、対応する帳票の下書きを生成する。
 * Clerk認証ルート（/api/generate）と拡張トークン認証ルート（/api/extension/generate）の
 * 両方から使う共通ディスパッチャ。認証は呼び出し側の責務。
 */
export async function generateFromBody(body: Record<string, unknown>): Promise<unknown> {
  assertInputSize(body);
  // 既存クライアント互換のため documentType 未指定はケアプラン扱い
  const documentType = str(body, "documentType") || "carePlan";
  const clientInfo = str(body, "clientInfo") || undefined;

  switch (documentType) {
    case "carePlan": {
      const assessmentNotes = str(body, "assessmentNotes");
      if (!assessmentNotes) {
        throw new GenerateRequestError(400, "アセスメント・面談メモを入力してください。");
      }
      return generateCarePlan({ clientInfo, assessmentNotes });
    }
    case "assessment": {
      const assessmentNotes = str(body, "assessmentNotes");
      if (!assessmentNotes) {
        throw new GenerateRequestError(400, "面談メモ・収集した情報を入力してください。");
      }
      return generateAssessment({ clientInfo, assessmentNotes });
    }
    case "monitoring": {
      const previousPlanSummary = str(body, "previousPlanSummary");
      const monitoringNotes = str(body, "monitoringNotes");
      if (!previousPlanSummary) {
        throw new GenerateRequestError(
          400,
          "前回のケアプラン（目標・サービス）を入力してください。",
        );
      }
      if (!monitoringNotes) {
        throw new GenerateRequestError(400, "最新の状況・モニタリングメモを入力してください。");
      }
      return generateMonitoring({ clientInfo, previousPlanSummary, monitoringNotes });
    }
    case "meetingSummary": {
      const meetingNotes = str(body, "meetingNotes");
      if (!meetingNotes) {
        throw new GenerateRequestError(400, "サービス担当者会議のメモを入力してください。");
      }
      return generateMeetingSummary({ clientInfo, meetingNotes });
    }
    case "supportLog": {
      const supportNotes = str(body, "supportNotes");
      if (!supportNotes) {
        throw new GenerateRequestError(400, "支援の対応メモを入力してください。");
      }
      return generateSupportLog({ clientInfo, supportNotes });
    }
    default:
      throw new GenerateRequestError(400, "不明な書類種別です。");
  }
}
