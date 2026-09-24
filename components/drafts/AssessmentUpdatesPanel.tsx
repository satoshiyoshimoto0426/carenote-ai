"use client";

/**
 * 電話メモから読み取れた「状態像の変化」を、アセスメント欄へ追記する案の表示（第5段・CareNote側）。
 * ここでは書き込まない。職員が案を読み、コピーして介護ソフトの該当欄の末尾に貼る（どのソフトでも使える型）。
 * カイポケ向けの半自動追記（退避→追記→前後の確認）はブラウザ拡張側（extension/）が担う。
 */
import { useState } from "react";
import type { AssessmentUpdate } from "@/types/supportLog";

const FIELD_LABELS: Record<AssessmentUpdate["field"], string> = {
  mainComplaints: "主訴・意向（P1 本人欄）",
  lifeHistory: "生活歴・経過（P1）",
  overview: "全体のまとめ（P10）",
};

interface Props {
  updates: AssessmentUpdate[];
  secondaryClass: string;
}

/**
 * アセスメント欄への追記案の一覧（案ごとにコピーできる）。案が無ければ何も出さない。
 * 使う所: つくる（支援経過の結果）。A案（R1・2026-09-24）: 角を丸めた箱をやめ、細い線で囲んだ注意の黄色の帯にし、
 * 案と案の間は 1px の線。欄の名前の札は緑でなく細い線の札（緑は主ボタンと選択中の印だけ）。文字は以前のまま。
 */
export default function AssessmentUpdatesPanel({ updates, secondaryClass }: Props) {
  const [copied, setCopied] = useState<number | null>(null);
  if (updates.length === 0) return null;

  const copy = async (text: string, i: number) => {
    await navigator.clipboard.writeText(text);
    setCopied(i);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="mt-6 border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3">
      <h3 className="mb-1 text-[13.5px] font-bold text-[var(--amber)]">
        アセスメントへの追記案（<span className="tnum">{updates.length}</span>件）
      </h3>
      <p className="mb-2 text-xs leading-[1.8] text-[var(--amber)]">
        今の文章は消さず、該当欄の<strong>末尾に足す</strong>
        案です。内容を読んで納得したものだけ、コピーして貼ってください。
      </p>
      <ul>
        {updates.map((u, i) => (
          <li key={`${u.field}:${u.text}`} className="border-t border-[var(--amber-line)] py-3">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-[4px] border border-[var(--amber-line)] bg-[var(--card)] px-2 py-0.5 text-xs text-[var(--ink-2)]">
                {FIELD_LABELS[u.field] ?? u.field}
              </span>
              {u.confidence === "要確認" && (
                <span className="text-xs font-medium text-[var(--clay)]">推測を含む・要確認</span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-[14.5px] leading-[1.85]">{u.text}</p>
            <p className="mt-1 text-xs text-[var(--ink-2)]">理由: {u.reason}</p>
            <div className="mt-2">
              <button
                type="button"
                onClick={() => copy(u.text, i)}
                className={`${secondaryClass} text-xs`}
              >
                {copied === i ? "コピーしました" : "この追記文をコピー"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
