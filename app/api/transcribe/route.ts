import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { hitRateLimit, type RateState } from "@/lib/extensionAuth";
import { isSupportPlanAOpen } from "@/lib/supportPlan/edition";
import {
  clientIpOf,
  GUEST_TRANSCRIBE_DAILY_LIMIT,
  newGuestQuotaStore,
  takeGuestTurn,
} from "@/lib/supportPlan/guestAccess";
import { createOpenAiTranscriber, TranscribeError } from "@/lib/transcribe/provider";
import { TRANSCRIBE_RATE_LIMIT, validateAudio } from "@/lib/transcribe/validate";

// 長い通話の文字起こしは時間がかかる
export const maxDuration = 300;

/**
 * 1人あたりの回数上限（1時間に30回）。
 *
 * なぜ要るか:
 *   文字起こしは1回ごとに外部サービスへ音声を送り、料金もかかる。押し間違いや画面の連打、
 *   将来の区切り送信（docs/specs/recording-pipeline.md R3）の取りこぼしループで、
 *   知らないうちに何十回も走りうる。60分の会議を4〜5分ずつに分けても13回程度なので、
 *   30回あれば実運用を邪魔せず、暴走だけを止められる。
 *
 * 限界: 置き場が温まっている間だけ有効（サーバレスの実体ごとに数える）。
 *   完全な制限が要るようになったら KV へ上げる（§2.5-F）。
 */
const RATE_LIMIT = TRANSCRIBE_RATE_LIMIT;
const rateStore = new Map<string, RateState>();
/** ログインなしの試行版で、ログインしていない人の文字起こしを数える置き場（lib/supportPlan/guestAccess.ts） */
const guestTranscribes = newGuestQuotaStore();

/**
 * 電話の録音ファイルを文字にして返す（第3段・docs/specs/call-pipeline.md）。
 * 音声は保存しない（受け取って外部サービスへ渡し、返事の文字だけ返す）。
 * 返した文字はそのあと /create の「送る前に見る」→ 黒塗り → AI要約の流れに乗る。
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  // ログインなしの試行版（印 NEXT_PUBLIC_SUPPORT_PLAN_A=open）だけ、ログインしていない人の録音も文字にする
  // （計画書の画面の録音 ── 2026-10-05 吉本さんの決定）。回数は IP アドレスごと・1日の上限で絞る
  const guest = !userId && isSupportPlanAOpen();
  if (!userId && !guest) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const transcriber = createOpenAiTranscriber();
  if (!transcriber) {
    return NextResponse.json(
      {
        error:
          "文字起こしサービスが設定されていません（管理者が OPENAI_API_KEY を設定してください）。",
      },
      { status: 503 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "音声ファイルを受け取れませんでした。" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "音声ファイルを選んでください。" }, { status: 400 });

  const check = validateAudio(file.name, file.size);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  // 数えるのは**外へ送る直前**。形式違い・大きさ超過・鍵未設定で弾いたものは1回に数えない
  // （押し間違いで枠を使い切ると、直したときには送れなくなる ── 独立審査 2026-09-17）
  if (userId) {
    const rate = hitRateLimit(rateStore, userId, Date.now(), RATE_LIMIT);
    if (rate.limited) {
      return NextResponse.json(
        {
          error: `文字にする回数が1時間の上限（${RATE_LIMIT.limit}回）に達しました。1時間ほど空けてからもう一度お試しください。急ぐときは管理者に相談してください。`,
        },
        { status: 429 },
      );
    }
  } else {
    // ゲスト（試行版）は IP アドレスごとに1時間 RATE_LIMIT.limit 回・全員で1日 GUEST_TRANSCRIBE_DAILY_LIMIT 回まで
    const turn = takeGuestTurn(guestTranscribes, clientIpOf(req.headers), Date.now(), {
      daily: GUEST_TRANSCRIBE_DAILY_LIMIT,
      perIpHourly: RATE_LIMIT.limit,
      label: "文字起こし",
    });
    if (!turn.ok) return NextResponse.json({ error: turn.error }, { status: 429 });
  }

  try {
    const { text } = await transcriber.transcribe(file, `audio.${check.ext}`);
    return NextResponse.json({ text });
  } catch (e) {
    if (e instanceof TranscribeError) {
      return NextResponse.json({ error: e.message }, { status: e.status >= 500 ? 502 : e.status });
    }
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[transcribe] error:", detail);
    return NextResponse.json({ error: "文字起こしに失敗しました。" }, { status: 500 });
  }
}
