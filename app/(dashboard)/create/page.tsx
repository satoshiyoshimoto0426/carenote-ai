"use client";

import { useState } from "react";
import type { CarePlanDraft } from "@/types/carePlan";

/** 下書きを人が確認・コピーしやすいプレーンテキストに整形する */
function draftToText(d: CarePlanDraft): string {
  const lines: string[] = [];
  lines.push(`利用者名: ${d.clientName}`);
  lines.push("");
  lines.push(`【利用者及び家族の意向】\n${d.intentions}`);
  lines.push("");
  lines.push(`【総合的な援助の方針】\n${d.comprehensivePolicy}`);
  lines.push("");
  lines.push("【生活全般の解決すべき課題（ニーズ）】");
  d.needs.forEach((n, i) => {
    lines.push(`${i + 1}. ${n.need}`);
    lines.push(`   長期目標: ${n.longTermGoal}（${n.longTermPeriod}）`);
    lines.push(`   短期目標: ${n.shortTermGoal}（${n.shortTermPeriod}）`);
    for (const s of n.services) {
      lines.push(`   - ${s.content} / ${s.serviceType} / ${s.frequency} / ${s.period}`);
    }
  });
  if (d.itemsToConfirm.length > 0) {
    lines.push("");
    lines.push("【要確認事項】");
    for (const item of d.itemsToConfirm) {
      lines.push(`・${item}`);
    }
  }
  return lines.join("\n");
}

export default function CreatePage() {
  const [clientInfo, setClientInfo] = useState("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CarePlanDraft | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!assessmentNotes.trim()) {
      setError("アセスメント・面談メモを入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    setDraft(null);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientInfo, assessmentNotes }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setDraft(data as CarePlanDraft);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draftToText(draft));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-100 mb-1">ケアプラン作成（下書き）</h1>
        <p className="text-slate-400 text-sm">
          面談メモ・アセスメント結果から、第1・2表の下書きをAIが作成します
        </p>
      </div>

      {!draft ? (
        <div className="animate-fadeIn space-y-4">
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

          <div>
            <label
              htmlFor="assessmentNotes"
              className="block text-slate-300 text-sm font-semibold mb-1.5"
            >
              アセスメント・面談メモ <span className="text-red-400">*</span>
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
            {loading ? "🧠 AIが作成中です…（30秒〜1分ほど）" : "📝 下書きを生成する"}
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

          <DraftSection title="利用者名" body={draft.clientName} />
          <DraftSection title="利用者及び家族の意向（第1表）" body={draft.intentions} />
          <DraftSection title="総合的な援助の方針（第1表）" body={draft.comprehensivePolicy} />

          {/* 第2表 */}
          <div>
            <div className="text-slate-300 font-bold text-sm mb-2">
              生活全般の解決すべき課題と目標・サービス（第2表）
            </div>
            <div className="space-y-3">
              {draft.needs.map((n, i) => (
                <div
                  key={n.need}
                  className="rounded-xl p-4"
                  style={{
                    background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
                    border: "1px solid #334155",
                  }}
                >
                  <div className="text-slate-100 font-bold text-sm mb-2">
                    {i + 1}. {n.need}
                  </div>
                  <div className="text-slate-300 text-xs leading-relaxed space-y-1">
                    <div>
                      <span className="text-sky-400">長期目標:</span> {n.longTermGoal}（
                      {n.longTermPeriod}）
                    </div>
                    <div>
                      <span className="text-sky-400">短期目標:</span> {n.shortTermGoal}（
                      {n.shortTermPeriod}）
                    </div>
                  </div>
                  {n.services.length > 0 && (
                    <div className="mt-2.5 border-t border-slate-700 pt-2.5 space-y-1">
                      {n.services.map((s) => (
                        <div key={s.content} className="text-slate-300 text-xs">
                          ・{s.content}
                          <span className="text-slate-500">
                            （{s.serviceType} / {s.frequency} / {s.period}）
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 要確認事項 */}
          {draft.itemsToConfirm.length > 0 && (
            <div
              className="rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, rgba(127,29,29,0.13), #1e293b)",
                border: "1px solid rgba(239,68,68,0.27)",
              }}
            >
              <div className="text-red-300 font-bold text-sm mb-2">🔎 要確認事項（人が確認）</div>
              <div className="space-y-1">
                {draft.itemsToConfirm.map((item) => (
                  <div key={item} className="text-slate-200 text-xs leading-relaxed">
                    ・{item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setDraft(null);
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

function DraftSection({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        border: "1px solid #334155",
      }}
    >
      <div className="text-slate-400 text-xs font-semibold mb-1.5">{title}</div>
      <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">{body}</div>
    </div>
  );
}
