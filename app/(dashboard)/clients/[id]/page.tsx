"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconCopy,
  IconFileText,
  IconLayers,
  IconLoader,
  IconLock,
  IconPlus,
} from "@/components/ui/icons";
import { btnPrimary, btnSecondary, Card, SectionTitle } from "@/components/ui/primitives";
import { documentContentToText } from "@/lib/draftText";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { ClientRecord } from "@/types/client";
import type { CareDocumentRecord, CareDocumentType } from "@/types/document";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";

const DOC_LABELS: Record<CareDocumentType, string> = {
  assessment: "アセスメント（課題分析）",
  carePlan: "ケアプラン 第1・2表",
  meetingSummary: "第4表 担当者会議の要点",
  supportLog: "第5表 支援経過",
  monitoring: "モニタリング",
};

function attrLine(c: ClientRecord): string {
  const a = c.attributes ?? {};
  return [a.age, a.gender, a.careLevel, a.household].filter(Boolean).join(" ・ ");
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

/** 書類の状態バッジ（G4）。draft=amber「下書き」／approved=緑「承認済み」。 */
function StatusBadge({ doc }: { doc: CareDocumentRecord }) {
  if (doc.status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs text-[var(--green)]">
        <IconCheck size={12} />
        承認済み
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-xs text-[#7A5B1E]">
      下書き
    </span>
  );
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [documents, setDocuments] = useState<CareDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // G4 承認UIの状態: 展開中の書類（1件のみ）・PATCH中の書類・操作エラー・コピー完了表示
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [patchingId, setPatchingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    (async () => {
      try {
        const resp = await fetch(`/api/clients/${params.id}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "読み込みに失敗しました");
        setClient(data.client as ClientRecord);
        setDocuments(data.documents as CareDocumentRecord[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const toggleExpand = (id: string) => {
    setActionError(null);
    setExpandedId((cur) => (cur === id ? null : id));
  };

  // 承認・承認取消（PATCH /api/documents/[id]）。成功時は更新後レコードで行を即時更新する
  const patchDocument = async (id: string, action: "approve" | "unapprove") => {
    setPatchingId(id);
    setActionError(null);
    try {
      const resp = await fetch(`/api/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error((data as { error?: string }).error || "更新に失敗しました");
      }
      const updated = data as CareDocumentRecord;
      setDocuments((prev) => prev.map((doc) => (doc.id === id ? updated : doc)));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setPatchingId(null);
    }
  };

  // 承認済み書類のコピー（G4: コピーできるのは approved のみ。draft は disabled＋hint）
  const copyDocument = async (doc: CareDocumentRecord) => {
    await navigator.clipboard.writeText(documentContentToText(doc.docType, doc.content));
    setCopiedId(doc.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // カイポケ拡張へ渡す用のJSONコピー（V3-lite）。拡張パネルの
  // 「下書きJSONを貼り付けて読み込む」に貼ると、生成し直さずに流し込みできる。
  // G4準拠: 承認済み書類のみ（このボタン自体を approved 分岐にのみ置く）。
  const copyForExtension = async (doc: CareDocumentRecord) => {
    await navigator.clipboard.writeText(JSON.stringify(doc.content, null, 2));
    setCopiedId(`ext-${doc.id}`);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (loading)
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <IconLoader size={15} className="animate-spin" />
        読み込み中…
      </div>
    );
  if (error || !client)
    return (
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-2 text-sm text-[var(--clay)]">
          <IconAlert size={15} className="shrink-0" />
          {error || "利用者が見つかりません"}
        </div>
        <Link
          href="/clients"
          className="mt-3 inline-block text-sm text-[var(--green)] hover:underline"
        >
          利用者一覧へ
        </Link>
      </div>
    );

  // 表示用の派生値: 標準5帳票のうち、まだ書類が無い種別（「＋つくる」行に使う）
  const missingTypes = (Object.keys(DOC_LABELS) as CareDocumentType[]).filter(
    (t) => !documents.some((d) => d.docType === t),
  );

  return (
    <div className="mx-auto max-w-2xl">
      <nav aria-label="パンくず" className="mb-5 flex items-center gap-1.5 text-xs">
        <Link
          href="/clients"
          className="text-[var(--muted)] transition-colors hover:text-[var(--green)]"
        >
          利用者
        </Link>
        <IconChevronRight size={13} className="text-[var(--faint)]" />
        <span className="text-[var(--ink)]">{client.code}様</span>
      </nav>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1
            className="text-[26px] font-medium leading-snug text-[var(--ink)]"
            style={{ fontFamily: "var(--serif)" }}
          >
            {client.code}様<span className="text-base text-[var(--muted)]">（仮名）</span>
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--green-line)] bg-[var(--green-soft)] px-3 py-1 text-xs text-[var(--green)]">
            <IconLock size={13} />
            仮名表示中
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">{attrLine(client) || "（属性未設定）"}</p>
      </header>

      <div className="mb-10 flex items-center gap-5">
        <Link href="/rescue" className={`${btnPrimary} whitespace-nowrap`}>
          <IconLayers size={16} />
          救済モードで一式
        </Link>
      </div>

      <SectionTitle className="mb-3">この方の書類</SectionTitle>
      {documents.length === 0 && (
        <p className="mb-3 text-sm text-[var(--muted)]">
          まだ書類がありません。「救済モードで一式」から作成して保存できます。
        </p>
      )}
      <Card className="overflow-hidden">
        <ul className="divide-y divide-[var(--line-soft)]">
          {documents.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => toggleExpand(d.id)}
                aria-expanded={expandedId === d.id}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--paper)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconFileText size={16} className="shrink-0 text-[var(--faint)]" />
                  <span className="truncate text-sm text-[var(--ink)]">
                    {DOC_LABELS[d.docType] ?? d.docType}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <StatusBadge doc={d} />
                  <span className="text-xs text-[var(--faint)]">
                    {new Date(d.createdAt).toLocaleDateString("ja-JP")}
                  </span>
                  <IconChevronRight
                    size={14}
                    className={`text-[var(--faint)] transition-transform ${
                      expandedId === d.id ? "rotate-90" : ""
                    }`}
                  />
                </span>
              </button>

              {expandedId === d.id && (
                <div className="animate-fadeIn border-t border-[var(--line-soft)]">
                  {/* 操作行（G4 承認モデル）: draft=承認する＋コピー不可 / approved=コピー＋承認取消 */}
                  <div className="space-y-3 border-b border-[var(--line-soft)] bg-[var(--paper)] px-5 py-4">
                    {d.status === "draft" ? (
                      <>
                        <p className="text-xs leading-relaxed text-[var(--muted)]">
                          内容を確認しました。この書類を承認します（承認者と日時が記録されます）
                        </p>
                        <div className="flex flex-wrap items-center gap-4">
                          <button
                            type="button"
                            onClick={() => patchDocument(d.id, "approve")}
                            disabled={patchingId === d.id}
                            className={btnPrimary}
                          >
                            {patchingId === d.id ? (
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
                            <span className="text-xs text-[var(--faint)]">
                              承認後にコピーできます
                            </span>
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-4">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs text-[var(--green)]">
                          <IconCheck size={12} />
                          承認済み・{approvedDateLabel(d.approvedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyDocument(d)}
                          className={btnSecondary}
                        >
                          {copiedId === d.id ? (
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
                          onClick={() => copyForExtension(d)}
                          className={btnSecondary}
                          title="カイポケ拡張のサイドパネル「下書きJSONを貼り付けて読み込む」に貼ると、生成し直さずに流し込みできます"
                        >
                          {copiedId === `ext-${d.id}` ? (
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
                          onClick={() => patchDocument(d.id, "unapprove")}
                          disabled={patchingId === d.id}
                          className="text-xs text-[var(--clay)] underline underline-offset-4 transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {patchingId === d.id ? "取消中…" : "承認を取り消す"}
                        </button>
                      </div>
                    )}
                    {d.status === "approved" && (
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
                    <SavedDocView doc={d} />
                  </div>
                </div>
              )}
            </li>
          ))}
          {missingTypes.map((t) => (
            <li key={t}>
              <Link
                href="/create"
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--paper)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconFileText size={16} className="shrink-0 text-[var(--faint)]" />
                  <span className="truncate text-sm text-[var(--faint)]">{DOC_LABELS[t]}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--faint)]">
                  <IconPlus size={13} />
                  つくる
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
