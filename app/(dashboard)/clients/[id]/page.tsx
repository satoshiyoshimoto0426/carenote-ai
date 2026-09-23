"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import DocumentPanel, { StatusBadge } from "@/components/clients/DocumentPanel";
import RelatedPeople from "@/components/clients/RelatedPeople";
import SavedTranscripts from "@/components/clients/SavedTranscripts";
import {
  IconAlert,
  IconChevronRight,
  IconFileText,
  IconLayers,
  IconLoader,
  IconLock,
  IconPlus,
} from "@/components/ui/icons";
import {
  btnPrimary,
  btnSecondary,
  Card,
  inputClass,
  SectionTitle,
} from "@/components/ui/primitives";
import { clientAttrLine } from "@/lib/clients/clientList";
import { DOC_ORDER, DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import type { ClientRecord } from "@/types/client";
import type { CareDocumentRecord } from "@/types/document";

/**
 * 利用者の詳細（/clients/[id]）。一覧の表の右の、幅 440px の区画の中身（2026-09-24 A5 ＝ 計画 U2）。
 *
 * 表と上の帯は app/(dashboard)/clients/layout.tsx（components/clients/ClientsLayout.tsx）にあり、ここは右の区画だけ。
 * 道しるべ「利用者 / B様」は上の帯へ移した（以前はこの画面の頭にあった）。以前の本文の器（.legacy-page・幅の上限）も外した。
 * 中身（関係者名簿・残した文字起こし・書類と承認）はまだ以前の見た目のまま ── A案の区画の形（見出し・つくる・
 * 書類の種類ごとの行）への作り替えは計画 U3b/U4。開いた書類の承認（G4）の操作と中身は components/clients/DocumentPanel.tsx
 * （計画 U3a で中身を変えずに移した）。
 * この画面は読み込み中・見つからない・本体の3通りの根元を返すので、余白を1か所で付けられるよう中身を ClientDetail に分けた。
 */
export default function ClientDetailPage() {
  return (
    <div className="px-7 pt-7 pb-10">
      <ClientDetail />
    </div>
  );
}

/** 利用者の詳細の中身（利用者の情報・保存した書類と承認・関係者名簿・残した文字起こし）。 */
function ClientDetail() {
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [documents, setDocuments] = useState<CareDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 開いている書類（1件のみ）。承認の操作は components/clients/DocumentPanel.tsx が持つ
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setExpandedId((cur) => (cur === id ? null : id));
  };

  // 承認・取消が通ったら、サーバーが返した書類で同じ行を差し替える
  const replaceDocument = (updated: CareDocumentRecord) => {
    setDocuments((prev) => prev.map((doc) => (doc.id === updated.id ? updated : doc)));
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
      <div>
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

  // 表示用の派生値: 標準5帳票のうち、まだ書類が無い種別（「＋つくる」行に使う）。
  // 並び順は lib/create/docTypes.ts の DOC_ORDER（ケアマネジメントの流れ順）。
  const missingTypes = DOC_ORDER.filter((t) => !documents.some((d) => d.docType === t));

  return (
    <div>
      {/* D4: 関係者名簿（家族・担当者・主治医）。登録した名前は黒塗りで「A様の長女」等に置き換わる */}
      <div className="mb-5">
        <RelatedPeople
          clientId={client.id}
          clientCode={client.code}
          inputClass={inputClass}
          primaryClass={btnPrimary}
          secondaryClass={btnSecondary}
        />
        <SavedTranscripts
          clientId={client.id}
          clientCode={client.code}
          secondaryClass={btnSecondary}
        />
      </div>

      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[21px] font-bold leading-snug tracking-[0.01em] text-[var(--ink)]">
            {client.code}様<span className="text-sm font-normal text-[var(--muted)]">（仮名）</span>
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-1 text-xs text-[var(--green)]">
            <IconLock size={13} />
            仮名表示中
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {clientAttrLine(client) || "（属性未設定）"}
        </p>
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
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconFileText size={16} className="shrink-0 text-[var(--faint)]" />
                  <span className="truncate text-sm text-[var(--ink)]">
                    {DOC_TYPE_LABELS[d.docType]?.saved ?? d.docType}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2.5">
                  <StatusBadge doc={d} />
                  <span className="tnum text-xs text-[var(--faint)]">
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

              {expandedId === d.id && <DocumentPanel doc={d} onChange={replaceDocument} />}
            </li>
          ))}
          {missingTypes.map((t) => (
            <li key={t}>
              <Link
                href="/create"
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-2)]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <IconFileText size={16} className="shrink-0 text-[var(--faint)]" />
                  <span className="truncate text-sm text-[var(--faint)]">
                    {DOC_TYPE_LABELS[t].saved}
                  </span>
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
