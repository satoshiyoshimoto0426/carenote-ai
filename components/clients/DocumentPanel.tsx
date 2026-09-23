"use client";

import { useState } from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import { IconAlert, IconCheck, IconCopy, IconLayers, IconLoader } from "@/components/ui/icons";
import { btnPrimary, btnSecondary } from "@/components/ui/primitives";
import { documentContentToText } from "@/lib/draftText";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { CareDocumentRecord } from "@/types/document";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";

/**
 * 保存した書類1枚の「承認（G4）」の操作と中身の表示。利用者の画面（/clients/{id}）で書類を開いたときに出る。
 *
 * なぜ別の部品にしたか（2026-09-24 A6 ＝ 計画 U3a）:
 *   以前は app/(dashboard)/clients/[id]/page.tsx の中に直接書いてあり、検査が1つも無かった
 *   （redesign-maps の testsCoupled「NO tests exist」）。A案の区画に作り替えるときに、承認の決まりを
 *   黙って落とさないよう、中身を変えずにここへ移し、components/clients/DocumentPanel.live.test.tsx で固定した。
 *   文字・動きは移す前と同じ（画面の文字を変えるときは、使い方の本文 lib/manual/content.ts:1066・1197 と
 *   動画の台本 docs/MANUAL-VIDEO-SPEC.md:332 も一緒に直す）。
 *
 * 承認の決まり（G4 ── docs/CONTEXT-MAP.md「承認モデル」）:
 *   - 下書き（draft）: 「承認する」だけが押せる。「コピー」は押せない形で出し、横に「承認後にコピーできます」。
 *     **コピーを止めているのは画面だけ**（コピーはブラウザの中で起きる）なので、この形を崩すと止める物が無くなる。
 *   - 承認済み（approved）: 「コピー」「カイポケ用データ」「承認を取り消す」。「カイポケ用データ」は承認済みのときだけ置く。
 *   - 承認・取消は PATCH /api/documents/{id}（{action:"approve"|"unapprove"}・app/api/documents/[id]/route.ts）。
 *     承認者と日時はサーバーが記録する（lib/db/documents.ts の approveDocument）。
 *   - 「カイポケ用データ」がコピーする文字は JSON.stringify(content, null, 2) そのもの。カイポケ拡張のサイドパネルの
 *     「下書きJSONを貼り付けて読み込む」（extension/src/panel.html）がこの形を読む ── 形を変えると拡張が読めなくなる。
 *
 * @param doc 開いている書類（GET /api/clients/{id} の documents の1件）。
 * @param onChange 承認・取消が通ったときに、サーバーが返した新しい書類を渡す（呼ぶ側が一覧の同じ行を差し替える）。
 * 使う所: components/clients/ClientPane.tsx（書類を開いたとき）。
 */
export default function DocumentPanel({
  doc,
  onChange,
}: {
  doc: CareDocumentRecord;
  onChange: (updated: CareDocumentRecord) => void;
}) {
  // 承認の操作の状態: PATCH の途中か・操作の失敗の文・「コピーしました」を出している方（書類の文字／カイポケ用データ）
  const [patching, setPatching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"text" | "ext" | null>(null);

  // 承認・承認取消（PATCH /api/documents/[id]）。成功時は更新後レコードを呼ぶ側へ渡し、行を即時更新する
  const patchDocument = async (action: "approve" | "unapprove") => {
    setPatching(true);
    setActionError(null);
    try {
      const resp = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error((data as { error?: string }).error || "更新に失敗しました");
      }
      onChange(data as CareDocumentRecord);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setPatching(false);
    }
  };

  // 承認済み書類のコピー（G4: コピーできるのは approved のみ。draft は disabled＋hint）
  const copyDocument = async () => {
    await navigator.clipboard.writeText(documentContentToText(doc.docType, doc.content));
    setCopied("text");
    setTimeout(() => setCopied(null), 1500);
  };

  // カイポケ拡張へ渡す用のJSONコピー（V3-lite）。拡張パネルの
  // 「下書きJSONを貼り付けて読み込む」に貼ると、生成し直さずに流し込みできる。
  // G4準拠: 承認済み書類のみ（このボタン自体を approved 分岐にのみ置く）。
  const copyForExtension = async () => {
    await navigator.clipboard.writeText(JSON.stringify(doc.content, null, 2));
    setCopied("ext");
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="animate-fadeIn border-t border-[var(--line-soft)]">
      {/* 操作行（G4 承認モデル）: draft=承認する＋コピー不可 / approved=コピー＋承認取消 */}
      <div className="space-y-3 border-b border-[var(--line-soft)] bg-[var(--paper)] px-5 py-4">
        {doc.status === "draft" ? (
          <>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              内容を確認しました。この書類を承認します（承認者と日時が記録されます）
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={() => patchDocument("approve")}
                disabled={patching}
                className={btnPrimary}
              >
                {patching ? (
                  <>
                    <IconLoader size={15} className="animate-spin" />
                    承認中…
                  </>
                ) : (
                  <>
                    <IconCheck size={15} />
                    承認する
                  </>
                )}
              </button>
              <span className="flex items-center gap-2.5">
                <button type="button" disabled className={btnSecondary}>
                  <IconCopy size={15} />
                  コピー
                </button>
                <span className="text-xs text-[var(--faint)]">承認後にコピーできます</span>
              </span>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs text-[var(--green)]">
              <IconCheck size={12} />
              承認済み・<span className="tnum">{approvedDateLabel(doc.approvedAt)}</span>
            </span>
            <button type="button" onClick={copyDocument} className={btnSecondary}>
              {copied === "text" ? (
                <>
                  <IconCheck size={15} className="text-[var(--green)]" />
                  コピーしました
                </>
              ) : (
                <>
                  <IconCopy size={15} />
                  コピー
                </>
              )}
            </button>
            <button
              type="button"
              onClick={copyForExtension}
              className={btnSecondary}
              title="カイポケ拡張のサイドパネル「下書きJSONを貼り付けて読み込む」に貼ると、生成し直さずに流し込みできます"
            >
              {copied === "ext" ? (
                <>
                  <IconCheck size={15} className="text-[var(--green)]" />
                  コピーしました
                </>
              ) : (
                <>
                  <IconLayers size={15} />
                  カイポケ用データ
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => patchDocument("unapprove")}
              disabled={patching}
              className="text-xs text-[var(--clay)] underline underline-offset-4 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {patching ? "取消中…" : "承認を取り消す"}
            </button>
          </div>
        )}
        {doc.status === "approved" && (
          <p className="text-xs leading-relaxed text-[var(--faint)]">
            「カイポケ用データ」をコピー → カイポケ画面で拡張パネルを開き、帳票の種類を
            合わせて「下書きJSONを貼り付けて読み込む」→「この画面に流し込む」
          </p>
        )}
        {actionError && (
          <p className="flex items-start gap-1.5 text-xs text-[var(--clay)]">
            <IconAlert size={14} className="mt-0.5 shrink-0" />
            {actionError}
          </p>
        )}
      </div>
      <div className="space-y-3 px-5 py-5">
        <SavedDocView doc={doc} />
      </div>
    </div>
  );
}

/**
 * 書類の状態の札（G4）。下書き＝注意の黄色「下書き」／承認済み＝緑「承認済み」。
 * 利用者の画面の書類の行（components/clients/ClientPane.tsx）と、開いた書類の見出しが使う。
 * 状態を画面から消さない（仕様 docs/specs/ui-redesign-and-client-storage.md の受け入れ条件「全書類が状態付きで一覧」）。
 */
export function StatusBadge({ doc }: { doc: CareDocumentRecord }) {
  if (doc.status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-[6px] border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs text-[var(--green)]">
        <IconCheck size={12} />
        承認済み
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-[6px] border border-[var(--amber-line)] bg-[var(--amber-soft)] px-2.5 py-0.5 text-xs text-[var(--amber)]">
      下書き
    </span>
  );
}

/** 承認日時（ISO）を「7/17」形式の短い表示にする（承認済みバッジ用）。 */
function approvedDateLabel(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

/**
 * 保存済み帳票の中身表示。docType に応じて components/drafts/ の対応 View へ振り分ける
 * （救済モードの DocView と同じ switch）。content は保存経路が各 Draft 型を保証するためキャスト。
 */
function SavedDocView({ doc }: { doc: CareDocumentRecord }) {
  switch (doc.docType) {
    case "assessment":
      return <AssessmentDraftView draft={doc.content as AssessmentDraft} />;
    case "carePlan":
      return <CarePlanDraftView draft={doc.content as CarePlanDraft} />;
    case "meetingSummary":
      return <MeetingSummaryDraftView draft={doc.content as MeetingSummaryDraft} />;
    case "supportLog":
      return <SupportLogDraftView draft={doc.content as SupportLogDraft} />;
    case "monitoring":
      return <MonitoringDraftView draft={doc.content as MonitoringDraft} />;
  }
}
