"use client";

import { useState } from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import ItemsToConfirm from "@/components/drafts/ItemsToConfirm";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import { assessmentToText, carePlanToText, monitoringToText } from "@/lib/draftText";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MonitoringDraft } from "@/types/monitoring";

type DocType = "carePlan" | "assessment" | "monitoring";

type GeneratedResult =
  | { type: "carePlan"; draft: CarePlanDraft }
  | { type: "assessment"; draft: AssessmentDraft }
  | { type: "monitoring"; draft: MonitoringDraft };

const DOC_META: Record<DocType, { icon: string; label: string; description: string }> = {
  assessment: {
    icon: "🔍",
    label: "アセスメント",
    description: "面談メモから課題分析の下書き",
  },
  carePlan: {
    icon: "📋",
    label: "ケアプラン（第1・2表）",
    description: "アセス結果から計画書の下書き",
  },
  monitoring: {
    icon: "📈",
    label: "モニタリング",
    description: "前回プラン＋最新状況から記録の下書き",
  },
};

/** ケアマネジメントの流れ順に表示する */
const DOC_ORDER: DocType[] = ["assessment", "carePlan", "monitoring"];

function resultToText(result: GeneratedResult): string {
  switch (result.type) {
    case "carePlan":
      return carePlanToText(result.draft);
    case "assessment":
      return assessmentToText(result.draft);
    case "monitoring":
      return monitoringToText(result.draft);
  }
}

export default function CreatePage() {
  const [docType, setDocType] = useState<DocType>("carePlan");
  const [clientInfo, setClientInfo] = useState("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [previousPlanSummary, setPreviousPlanSummary] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [copied, setCopied] = useState(false);

  const switchDocType = (t: DocType) => {
    setDocType(t);
    setResult(null);
    setError(null);
  };

  const generate = async () => {
    // 帳票別の必須チェック（サーバ側でも検証する）
    if (docType === "monitoring") {
      if (!previousPlanSummary.trim()) {
        setError("前回のケアプラン（目標・サービス）を入力してください。");
        return;
      }
      if (!monitoringNotes.trim()) {
        setError("最新の状況・モニタリングメモを入力してください。");
        return;
      }
    } else if (!assessmentNotes.trim()) {
      setError(
        docType === "carePlan"
          ? "アセスメント・面談メモを入力してください。"
          : "面談メモ・収集した情報を入力してください。",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const payload: Record<string, string> = { documentType: docType, clientInfo };
      if (docType === "monitoring") {
        payload.previousPlanSummary = previousPlanSummary;
        payload.monitoringNotes = monitoringNotes;
      } else {
        payload.assessmentNotes = assessmentNotes;
      }

      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setResult({ type: docType, draft: data } as GeneratedResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(resultToText(result));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-100 mb-1">帳票作成（下書き）</h1>
        <p className="text-slate-400 text-sm">
          メモを入力すると、AIがルールに沿って帳票の下書きを作成します
        </p>
      </div>

      {/* 帳票セレクタ */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        {DOC_ORDER.map((t) => {
          const meta = DOC_META[t];
          const active = docType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => switchDocType(t)}
              className="rounded-xl px-2 py-3 text-center cursor-pointer transition-all"
              style={{
                background: active ? "rgba(59,130,246,0.15)" : "rgba(30,41,59,0.4)",
                border: active ? "1px solid rgba(59,130,246,0.5)" : "1px solid #334155",
              }}
            >
              <div className="text-2xl mb-1">{meta.icon}</div>
              <div
                className="text-xs font-bold leading-tight"
                style={{ color: active ? "#60a5fa" : "#94a3b8" }}
              >
                {meta.label}
              </div>
            </button>
          );
        })}
      </div>

      {!result ? (
        <div className="animate-fadeIn space-y-4">
          <p className="text-slate-500 text-xs -mt-2">{DOC_META[docType].description}</p>

          <div>
            <label
              htmlFor="clientInfo"
              className="block text-slate-300 text-sm font-semibold mb-1.5"
            >
              利用者の基本情報（任意）
            </label>
            <input
              id="clientInfo"
              type="text"
              value={clientInfo}
              onChange={(e) => setClientInfo(e.target.value)}
              placeholder="例: 85歳 女性 要介護2 独居"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none"
              style={{ border: "1px solid #334155" }}
            />
          </div>

          {docType === "monitoring" ? (
            <>
              <div>
                <label
                  htmlFor="previousPlanSummary"
                  className="block text-slate-300 text-sm font-semibold mb-1.5"
                >
                  前回のケアプラン（目標・サービスの要約） <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="previousPlanSummary"
                  value={previousPlanSummary}
                  onChange={(e) => setPreviousPlanSummary(e.target.value)}
                  rows={6}
                  placeholder="前回プランの短期目標・長期目標・サービス内容を貼り付けるか、要約して入力してください。"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none leading-relaxed resize-y"
                  style={{ border: "1px solid #334155" }}
                />
              </div>
              <div>
                <label
                  htmlFor="monitoringNotes"
                  className="block text-slate-300 text-sm font-semibold mb-1.5"
                >
                  最新の状況・モニタリングメモ <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="monitoringNotes"
                  value={monitoringNotes}
                  onChange={(e) => setMonitoringNotes(e.target.value)}
                  rows={8}
                  placeholder="訪問・電話で確認した最新の様子、本人や家族・事業所からの聞き取り内容を入力してください。"
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none leading-relaxed resize-y"
                  style={{ border: "1px solid #334155" }}
                />
              </div>
            </>
          ) : (
            <div>
              <label
                htmlFor="assessmentNotes"
                className="block text-slate-300 text-sm font-semibold mb-1.5"
              >
                {docType === "carePlan" ? "アセスメント・面談メモ" : "面談メモ・収集した情報"}{" "}
                <span className="text-red-400">*</span>
              </label>
              <textarea
                id="assessmentNotes"
                value={assessmentNotes}
                onChange={(e) => setAssessmentNotes(e.target.value)}
                rows={10}
                placeholder="利用者・家族との面談で得た情報、生活状況、困りごと、本人の希望などを自由に入力してください。"
                className="w-full px-4 py-3 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none leading-relaxed resize-y"
                style={{ border: "1px solid #334155" }}
              />
            </div>
          )}

          {error && (
            <div
              className="rounded-xl p-4"
              style={{ background: "rgba(127,29,29,0.2)", border: "1px solid #ef4444" }}
            >
              <div className="text-red-300 text-sm">⚠️ {error}</div>
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="w-full py-4 rounded-2xl border-none text-white text-lg font-black cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
              boxShadow: "0 4px 24px rgba(59,130,246,0.27)",
            }}
          >
            {loading
              ? "🧠 AIが作成中です…（30秒〜1分ほど）"
              : `📝 ${DOC_META[docType].label}の下書きを生成する`}
          </button>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-4">
          {/* 下書き注意 */}
          <div
            className="rounded-xl p-3.5"
            style={{ background: "rgba(120,53,15,0.18)", border: "1px solid #f59e0b" }}
          >
            <div className="text-amber-300 text-sm font-semibold">
              ⚠️ これはAIの下書きです。必ず内容を確認・修正のうえでご使用ください。
            </div>
          </div>

          {result.type === "carePlan" && <CarePlanDraftView draft={result.draft} />}
          {result.type === "assessment" && <AssessmentDraftView draft={result.draft} />}
          {result.type === "monitoring" && <MonitoringDraftView draft={result.draft} />}

          <ItemsToConfirm items={result.draft.itemsToConfirm} />

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className="flex-1 py-3.5 rounded-2xl border border-slate-600 bg-transparent text-slate-100 text-sm font-bold cursor-pointer hover:bg-slate-800 transition-colors"
            >
              ✏️ 別の下書きを作る
            </button>
            <button
              type="button"
              onClick={copyDraft}
              className="flex-1 py-3.5 rounded-2xl border-none text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
            >
              {copied ? "✓ コピーしました" : "📋 下書きをコピー"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
