import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { generateAssessment } from "@/lib/generation/assessment";
import { generateCarePlan } from "@/lib/generation/carePlan";
import { generateMeetingSummary } from "@/lib/generation/meetingSummary";
import { generateMonitoring } from "@/lib/generation/monitoring";

// Opus + adaptive thinking は時間がかかるため余裕を持たせる
export const maxDuration = 300;

/** body から文字列フィールドを安全に取り出す（trim済み。無ければ空文字） */
function str(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  // ── 認証チェック ──
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  // ── リクエスト解析 ──
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエストの解析に失敗しました。" }, { status: 400 });
  }

  // 既存クライアント互換のため documentType 未指定はケアプラン扱い
  const documentType = str(body, "documentType") || "carePlan";
  const clientInfo = str(body, "clientInfo") || undefined;

  // ── 帳票種別ごとに検証して生成 ──
  try {
    switch (documentType) {
      case "carePlan": {
        const assessmentNotes = str(body, "assessmentNotes");
        if (!assessmentNotes) {
          return NextResponse.json(
            { error: "アセスメント・面談メモを入力してください。" },
            { status: 400 },
          );
        }
        const draft = await generateCarePlan({ clientInfo, assessmentNotes });
        return NextResponse.json(draft);
      }
      case "assessment": {
        const assessmentNotes = str(body, "assessmentNotes");
        if (!assessmentNotes) {
          return NextResponse.json(
            { error: "面談メモ・収集した情報を入力してください。" },
            { status: 400 },
          );
        }
        const draft = await generateAssessment({ clientInfo, assessmentNotes });
        return NextResponse.json(draft);
      }
      case "monitoring": {
        const previousPlanSummary = str(body, "previousPlanSummary");
        const monitoringNotes = str(body, "monitoringNotes");
        if (!previousPlanSummary) {
          return NextResponse.json(
            { error: "前回のケアプラン（目標・サービス）を入力してください。" },
            { status: 400 },
          );
        }
        if (!monitoringNotes) {
          return NextResponse.json(
            { error: "最新の状況・モニタリングメモを入力してください。" },
            { status: 400 },
          );
        }
        const draft = await generateMonitoring({
          clientInfo,
          previousPlanSummary,
          monitoringNotes,
        });
        return NextResponse.json(draft);
      }
      case "meetingSummary": {
        const meetingNotes = str(body, "meetingNotes");
        if (!meetingNotes) {
          return NextResponse.json(
            { error: "サービス担当者会議のメモを入力してください。" },
            { status: 400 },
          );
        }
        const draft = await generateMeetingSummary({ clientInfo, meetingNotes });
        return NextResponse.json(draft);
      }
      default:
        return NextResponse.json({ error: "不明な書類種別です。" }, { status: 400 });
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[generate] error:", documentType, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
