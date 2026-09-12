import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { AliasLoadError, getClientAliases } from "@/lib/db/clients";
import type { NameAlias } from "@/lib/privacy/pseudonymize";

/**
 * ログイン職員の「記号→実名」対応表（二枚方式の「手元のフル版」表示用）。
 * 実名は職員のブラウザにだけ返す（AI・ログには出さない）。保存帳票は記号のまま。
 * getClientAliases は表記ゆれ展開済みなので、記号ごとに元の1件（最も長い表記）へ戻す。
 */
export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });

  let expanded: NameAlias[];
  try {
    expanded = await getClientAliases({ userId, orgId: orgId ?? null });
  } catch (e) {
    if (e instanceof AliasLoadError)
      return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const byCode = new Map<string, string>();
  for (const { real, code } of expanded) {
    const cur = byCode.get(code);
    if (!cur || real.length > cur.length) byCode.set(code, real);
  }
  const aliases: NameAlias[] = [...byCode.entries()].map(([code, real]) => ({ code, real }));
  return NextResponse.json(aliases, { headers: { "Cache-Control": "no-store" } });
}
