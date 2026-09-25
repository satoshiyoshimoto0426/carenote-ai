"use client";

import { useEffect, useRef } from "react";
import { IconAlert } from "@/components/ui/icons";

/**
 * API の返事（JSON）から `warnings` を安全に取り出す。文字列の配列でなければ空（壊れた返事で画面を落とさない）。
 * 点検（app/(dashboard)/evaluate/page.tsx）と救済モード（app/(dashboard)/rescue/page.tsx）が、成功・失敗どちらの返事にも使う。
 */
export function warningsOf(data: unknown): string[] {
  if (typeof data !== "object" || data === null || !("warnings" in data)) return [];
  const w = (data as { warnings: unknown }).warnings;
  return Array.isArray(w) ? w.filter((x): x is string => typeof x === "string") : [];
}

/**
 * 一時保管（資料の PDF・画像）の削除に失敗したときの警告。点検（/evaluate）と救済モード（/rescue）の画面に置く。
 *
 * なぜあるか: 事業所向けのデータ取扱説明書で「削除に失敗した時は画面に警告」と約束している。
 *   サーバー（app/api/evaluate・app/api/rescue）が返事の `warnings` に入れた文（lib/blob/deleteTemp.ts）を、
 *   そのまま並べる。警告が無ければ何も描かない（場所も取らない）。
 * 色は注意の黄色（--amber*）。エラー（--clay*）にしないのは、書類の作成そのものは終わっていることがあるため。
 *
 * @param scrollIntoView 警告が出たときに、この枠を画面の中へ動かす（長い画面で、押したボタンから遠い位置に出るとき）。
 *   救済モードの結果の画面で使う（生成ボタンは長い入力欄の一番下にあり、結果に切り替わってもスクロールの位置が残るため
 *   ── 2026-09-25 独立審査）。
 */
export default function TempDeleteWarnings({
  warnings,
  scrollIntoView = false,
}: {
  warnings: readonly string[];
  scrollIntoView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = warnings.length > 0;
  useEffect(() => {
    // scrollIntoView が無い環境（テスト用の仮想ブラウザなど）では何もしない
    if (scrollIntoView && shown) ref.current?.scrollIntoView?.({ block: "center" });
  }, [scrollIntoView, shown]);
  if (!shown) return null;
  return (
    <div
      ref={ref}
      role="alert"
      className="flex items-start gap-2.5 border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3"
    >
      <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--amber)]" />
      <ul className="space-y-1 text-sm leading-relaxed text-[var(--amber)]">
        {warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
