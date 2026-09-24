"use client";

/**
 * カイポケ転記用シートの表示（ページ順・欄名・文字数つき）。コピー貼り付けの土台。
 * 「拡張用JSONをコピー」でブラウザ拡張へ渡すと、ページ単位で流し込める（extension: documentType "kaipokeAssessment"）。
 */
import { useState } from "react";
import {
  checkSheet,
  fieldKey,
  KAIPOKE_ASSESSMENT_FIELDS,
  KAIPOKE_PAGE_TITLES,
  type KaipokeAssessmentSheet,
  sheetToText,
} from "@/lib/kaipoke/assessmentLayout";

interface Props {
  sheet: KaipokeAssessmentSheet;
  primaryClass: string;
  secondaryClass: string;
}

/**
 * カイポケの10ページの欄に合わせた文章の表示（ページごとに開け閉め・欄ごとにコピー）。
 * 使う所: つくる（アセスメントの結果の「カイポケの欄に合わせる」のあと）。A案（R1・2026-09-24）: 角を丸めた箱をやめ、
 * ページと欄を 1px の線で区切った。つくるは緑の主ボタンを1画面に1つにするため primaryClass に脇のボタンの見た目を渡す。文字は以前のまま。
 */
export default function KaipokeSheetView({ sheet, primaryClass, secondaryClass }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const checks = new Map(checkSheet(sheet).map((c) => [c.key, c]));
  const inferred = sheet.fields.filter((f) => f.isInferred && f.text).length;
  const over = [...checks.values()].filter((c) => c.over).length;

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="section-label">カイポケの欄に合わせた文章（10ページ）</h3>
          <p className="text-xs text-[var(--muted)]">
            欄ごとにコピーして貼れます。{inferred > 0 && `推測を含む欄 ${inferred}件。`}
            {over > 0 && (
              <span className="tnum font-medium text-[var(--clay)]">
                文字数の上限を超える欄 {over}件。
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => copy(sheetToText(sheet), "all")}
            className={`${secondaryClass} text-xs`}
          >
            {copied === "all" ? "コピーしました" : "全ページをコピー"}
          </button>
          <button
            type="button"
            onClick={() =>
              copy(JSON.stringify({ documentType: "kaipokeAssessment", ...sheet }, null, 2), "json")
            }
            className={`${primaryClass} text-xs`}
          >
            {copied === "json" ? "コピーしました" : "拡張用JSONをコピー"}
          </button>
        </div>
      </div>

      {Array.from({ length: 10 }, (_, i) => i + 1).map((page) => {
        const specs = KAIPOKE_ASSESSMENT_FIELDS.filter((s) => s.page === page);
        const rows = specs
          .map((spec) => ({
            spec,
            f: sheet.fields.find((x) => x.page === page && x.formName === spec.formName),
          }))
          .filter((r) => r.f?.text);
        if (rows.length === 0) return null;
        return (
          <details key={page} className="border-b border-[var(--line-inner)] py-2" open={page <= 2}>
            <summary className="tnum cursor-pointer py-1.5 text-sm font-medium max-md:py-3">
              {page}枚目：{KAIPOKE_PAGE_TITLES[page]}（{rows.length}欄）
            </summary>
            <ul className="mt-1">
              {rows.map(({ spec, f }) => {
                if (!f) return null;
                const key = fieldKey(f);
                const c = checks.get(key);
                return (
                  <li key={key} className="border-t border-[var(--line-faint)] py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <div className="text-xs">
                        <span className="font-medium">{spec.label}</span>
                        <span className="mono ml-2 text-[var(--faint)]">{spec.formName}</span>
                        {f.isInferred && (
                          <span className="ml-2 font-medium text-[var(--clay)]">推測を含む</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={
                            c?.over
                              ? "tnum font-medium text-[var(--clay)]"
                              : "tnum text-[var(--muted)]"
                          }
                        >
                          {c?.length}/{c && Number.isFinite(c.limit) ? c.limit : "—"}字
                        </span>
                        <button
                          type="button"
                          onClick={() => copy(f.text, key)}
                          className={`${secondaryClass} text-xs`}
                        >
                          {copied === key ? "コピーしました" : "コピー"}
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{f.text}</p>
                    {f.note && <p className="mt-1 text-xs text-[var(--muted)]">メモ: {f.note}</p>}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </section>
  );
}
