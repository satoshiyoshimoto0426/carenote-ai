"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconAlert,
  IconCheck,
  IconChevronRight,
  IconFileText,
  IconLayers,
  IconLoader,
  IconLock,
  IconPlus,
} from "@/components/ui/icons";
import { btnPrimary, Card, SectionTitle } from "@/components/ui/primitives";
import type { ClientRecord } from "@/types/client";
import type { CareDocumentRecord, CareDocumentType } from "@/types/document";

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

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [documents, setDocuments] = useState<CareDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <li key={d.id} className="flex items-center justify-between gap-4 px-5 py-4">
              <span className="flex min-w-0 items-center gap-2.5">
                <IconFileText size={16} className="shrink-0 text-[var(--faint)]" />
                <span className="truncate text-sm text-[var(--ink)]">
                  {DOC_LABELS[d.docType] ?? d.docType}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                {d.status === "complete" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--green-line)] bg-[var(--green-soft)] px-2.5 py-0.5 text-xs text-[var(--green)]">
                    <IconCheck size={12} />
                    完成
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-[var(--amber-soft)] px-2.5 py-0.5 text-xs text-[#7A5B1E]">
                    下書き
                  </span>
                )}
                <span className="text-xs text-[var(--faint)]">
                  {new Date(d.createdAt).toLocaleDateString("ja-JP")}
                </span>
              </span>
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
