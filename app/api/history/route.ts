import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getEvaluations } from "@/lib/db";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }
  const records = await getEvaluations(userId);
  return NextResponse.json(records);
}
