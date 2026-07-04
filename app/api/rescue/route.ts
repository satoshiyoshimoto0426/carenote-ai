import { auth } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import {
  composePersonaNotes,
  generateRescueBundle,
  type RescuePersona,
} from "@/lib/generation/rescue";

// 5帳票を依存順＋並列で生成するため、通常の生成より長めに確保する。
export const maxDuration = 300;

/**
 * 救済モード: 1つの人物像メモから、整合の取れた書類一式
 * （アセスメント・第1/2表・第4表・第5表・モニタリング）の下書きを生成する。
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

  const str = (key: string): string | undefined =>
    typeof body[key] === "string" ? (body[key] as string) : undefined;

  const persona: RescuePersona = {
    clientInfo: str("clientInfo"),
    personality: str("personality"),
    lifeHistory: str("lifeHistory"),
    medical: str("medical"),
    physicalCognitive: str("physicalCognitive"),
    familyHousing: str("familyHousing"),
    currentServices: str("currentServices"),
    intentions: str("intentions"),
    additionalNotes: str("additionalNotes"),
  };

  // 基本情報以外に1つ以上の人物像が入っているか（合成結果が空でないか）で検証する。
  if (!composePersonaNotes(persona).trim()) {
    return NextResponse.json(
      { error: "利用者の人物像（性格・生活歴・診断など）を1つ以上入力してください。" },
      { status: 400 },
    );
  }

  try {
    const bundle = await generateRescueBundle(persona);
    return NextResponse.json(bundle);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    console.error("[rescue] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
