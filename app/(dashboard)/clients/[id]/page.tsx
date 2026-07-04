"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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

  if (loading) return <div className="text-slate-500 text-sm">読み込み中…</div>;
  if (error || !client)
    return (
      <div className="max-w-2xl mx-auto">
        <div className="text-red-300 text-sm">⚠️ {error || "利用者が見つかりません"}</div>
        <Link href="/clients" className="text-sky-400 text-sm underline">
          ← 利用者一覧へ
        </Link>
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/clients" className="text-slate-500 text-xs hover:text-slate-300">
        ← 利用者一覧
      </Link>

      <div className="flex items-start justify-between mt-2 mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-100">
            {client.code}様 <span className="text-slate-500 text-sm font-normal">（仮名）</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">{attrLine(client) || "（属性未設定）"}</p>
        </div>
        <Link
          href="/rescue"
          className="px-4 py-2 rounded-xl text-white text-sm font-bold cursor-pointer hover:opacity-90 whitespace-nowrap"
          style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
        >
          🛟 救済モードで一式
        </Link>
      </div>

      <div className="text-slate-300 font-bold text-sm mb-2">この方の書類</div>
      {documents.length === 0 ? (
        <div className="text-slate-500 text-sm">
          まだ書類がありません。「救済モードで一式」から作成して保存できます。
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #334155" }}
            >
              <span className="text-slate-100 text-sm">{DOC_LABELS[d.docType] ?? d.docType}</span>
              <span className="text-slate-400 text-xs">
                {d.status === "complete" ? "完成" : "下書き"} ・{" "}
                {new Date(d.createdAt).toLocaleDateString("ja-JP")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
