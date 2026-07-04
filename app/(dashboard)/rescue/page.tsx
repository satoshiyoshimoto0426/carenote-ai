"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "@/lib/draftText";
import type { RescueBundle } from "@/lib/generation/rescue";
import type { ClientRecord } from "@/types/client";

type DocKey = keyof RescueBundle;

/** 表示順とラベル（ケアマネジメントの流れ順）。 */
const DOC_ORDER: { key: DocKey; icon: string; label: string }[] = [
  { key: "assessment", icon: "🔍", label: "アセスメント（課題分析）" },
  { key: "carePlan", icon: "📋", label: "ケアプラン 第1・2表" },
  { key: "meetingSummary", icon: "🤝", label: "第4表 サービス担当者会議の要点" },
  { key: "supportLog", icon: "🗒️", label: "第5表 支援経過" },
  { key: "monitoring", icon: "📈", label: "モニタリング" },
];

/** 人物像フォームの状態。RescuePersona（lib/generation/rescue.ts）と対応。 */
type PersonaForm = {
  clientInfo: string;
  personality: string;
  lifeHistory: string;
  medical: string;
  physicalCognitive: string;
  familyHousing: string;
  currentServices: string;
  intentions: string;
  additionalNotes: string;
};

const EMPTY_PERSONA: PersonaForm = {
  clientInfo: "",
  personality: "",
  lifeHistory: "",
  medical: "",
  physicalCognitive: "",
  familyHousing: "",
  currentServices: "",
  intentions: "",
  additionalNotes: "",
};

/** 基本情報(clientInfo)以外の入力欄。介護アセスメントの観点に対応。 */
const PERSONA_FIELDS: {
  key: Exclude<keyof PersonaForm, "clientInfo">;
  label: string;
  placeholder: string;
  rows: number;
}[] = [
  {
    key: "personality",
    label: "性格・人柄・コミュニケーション",
    placeholder: "例: 穏やかだが頑固な面も。人と話すのが好き。耳が遠く大きな声が要る。",
    rows: 3,
  },
  {
    key: "lifeHistory",
    label: "生活歴・これまでの暮らし",
    placeholder: "例: 元教員。夫と死別後は独居。畑仕事が趣味だった。",
    rows: 3,
  },
  {
    key: "medical",
    label: "既往歴・診断・服薬",
    placeholder: "例: 脳梗塞（右片麻痺）。高血圧で降圧薬を服用。軽度の物忘れ。",
    rows: 3,
  },
  {
    key: "physicalCognitive",
    label: "心身の状態（できること・できないこと・認知）",
    placeholder: "例: 屋内は伝い歩き。入浴と外出に見守りが必要。短期記憶の低下あり。",
    rows: 3,
  },
  {
    key: "familyHousing",
    label: "家族構成・住環境",
    placeholder: "例: 長女が車で15分の距離に在住。持ち家・2階建てで段差が多い。",
    rows: 3,
  },
  {
    key: "currentServices",
    label: "現在利用しているサービス",
    placeholder: "例: 通所介護 週2回、訪問介護（生活援助）週1回。",
    rows: 2,
  },
  {
    key: "intentions",
    label: "本人・家族の意向・希望",
    placeholder: "例: 本人「住み慣れた家で暮らし続けたい」。長女「安全に過ごしてほしい」。",
    rows: 3,
  },
  {
    key: "additionalNotes",
    label: "その他・補足（自由記述）",
    placeholder: "診療情報提供書の内容など、補足があれば自由に書き写してください。",
    rows: 3,
  },
];

function docToText(key: DocKey, bundle: RescueBundle): string {
  switch (key) {
    case "assessment":
      return assessmentToText(bundle.assessment);
    case "carePlan":
      return carePlanToText(bundle.carePlan);
    case "meetingSummary":
      return meetingSummaryToText(bundle.meetingSummary);
    case "supportLog":
      return supportLogToText(bundle.supportLog);
    case "monitoring":
      return monitoringToText(bundle.monitoring);
  }
}

function DocView({ docKey, bundle }: { docKey: DocKey; bundle: RescueBundle }) {
  switch (docKey) {
    case "assessment":
      return <AssessmentDraftView draft={bundle.assessment} />;
    case "carePlan":
      return <CarePlanDraftView draft={bundle.carePlan} />;
    case "meetingSummary":
      return <MeetingSummaryDraftView draft={bundle.meetingSummary} />;
    case "supportLog":
      return <SupportLogDraftView draft={bundle.supportLog} />;
    case "monitoring":
      return <MonitoringDraftView draft={bundle.monitoring} />;
  }
}

export default function RescuePage() {
  const [persona, setPersona] = useState<PersonaForm>(EMPTY_PERSONA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<RescueBundle | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [targetClientId, setTargetClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedClientId, setSavedClientId] = useState<string | null>(null);

  // 結果が出たら、保存先の利用者候補を読み込む
  useEffect(() => {
    if (!bundle) return;
    (async () => {
      try {
        const resp = await fetch("/api/clients");
        if (resp.ok) setClients((await resp.json()) as ClientRecord[]);
      } catch {
        // 候補の取得失敗は致命的でない（新規利用者として保存できる）
      }
    })();
  }, [bundle]);

  const setField = (key: keyof PersonaForm, value: string) =>
    setPersona((p) => ({ ...p, [key]: value }));

  const generate = async () => {
    const hasContent = PERSONA_FIELDS.some((f) => persona[f.key].trim() !== "");
    if (!hasContent) {
      setError("性格・生活歴・診断など、利用者の人物像を1つ以上入力してください。");
      return;
    }
    setLoading(true);
    setError(null);
    setBundle(null);
    try {
      const resp = await fetch("/api/rescue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(persona),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setBundle(data as RescueBundle);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const copyDoc = async (key: DocKey) => {
    if (!bundle) return;
    await navigator.clipboard.writeText(docToText(key, bundle));
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const copyAll = async () => {
    if (!bundle) return;
    const all = DOC_ORDER.map(
      ({ key, label }) => `==== ${label} ====\n${docToText(key, bundle)}`,
    ).join("\n\n\n");
    await navigator.clipboard.writeText(all);
    setCopiedKey("all");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // 生成した5帳票を、選択した（または新規の）利用者に保存する
  const saveBundle = async () => {
    if (!bundle) return;
    setSaving(true);
    setError(null);
    try {
      let clientId = targetClientId;
      if (!clientId) {
        const resp = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newClientName.trim() || undefined }),
        });
        const created = await resp.json();
        if (!resp.ok) throw new Error(created.error || "利用者の作成に失敗しました");
        clientId = (created as ClientRecord).id;
      }
      for (const { key } of DOC_ORDER) {
        const resp = await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId, docType: key, content: bundle[key], source: "rescue" }),
        });
        if (!resp.ok) {
          const d = await resp.json();
          throw new Error(d.error || "保存に失敗しました");
        }
      }
      setSavedClientId(clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black text-slate-100 mb-1">🛟 救済モード（書類一式）</h1>
        <p className="text-slate-400 text-sm">
          利用者の人物像・診療情報などを入力すると、人物像・利用サービス・目標が一貫した
          書類一式（アセス／第1・2表／第4表／第5表／モニタリング）をまとめて下書きします。
        </p>
      </div>

      {!bundle ? (
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
              value={persona.clientInfo}
              onChange={(e) => setField("clientInfo", e.target.value)}
              placeholder="例: 85歳 女性 要介護2 独居"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none"
              style={{ border: "1px solid #334155" }}
            />
          </div>

          <p className="text-slate-500 text-xs">
            分かる項目だけで構いません（1つ以上）。空欄はAIが人物像から想定して補います。
          </p>

          {PERSONA_FIELDS.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`f-${field.key}`}
                className="block text-slate-300 text-sm font-semibold mb-1.5"
              >
                {field.label}
              </label>
              <textarea
                id={`f-${field.key}`}
                value={persona[field.key]}
                onChange={(e) => setField(field.key, e.target.value)}
                rows={field.rows}
                placeholder={field.placeholder}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 text-slate-100 text-sm outline-none leading-relaxed resize-y"
                style={{ border: "1px solid #334155" }}
              />
            </div>
          ))}

          <div
            className="rounded-xl p-3.5"
            style={{ background: "rgba(120,53,15,0.18)", border: "1px solid #f59e0b" }}
          >
            <div className="text-amber-300 text-xs leading-relaxed">
              ⚠️ 救済モードは、情報が不足する部分もAIが想定して
              <strong>完成形まで埋めます</strong>。 生成物は下書きです。
              <strong>必ず事実と照合し、ケアマネジャーが確認・修正のうえ</strong>
              ご使用ください。
            </div>
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
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              boxShadow: "0 4px 24px rgba(239,68,68,0.27)",
            }}
          >
            {loading ? "🧠 一式を作成中です…（1〜2分ほどかかります）" : "🛟 書類一式を生成する"}
          </button>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-4">
          <div
            className="rounded-xl p-3.5"
            style={{ background: "rgba(120,53,15,0.18)", border: "1px solid #f59e0b" }}
          >
            <div className="text-amber-300 text-sm font-semibold">
              ⚠️ これは人物像から生成した下書き一式です。AIが想定で補った内容を含みます。
              必ず事実と照合し、確認・修正のうえでご使用ください。
            </div>
          </div>

          {/* 利用者に保存 */}
          {savedClientId ? (
            <div
              className="rounded-2xl p-4"
              style={{ background: "rgba(6,78,59,0.18)", border: "1px solid rgba(16,185,129,0.4)" }}
            >
              <div className="text-emerald-300 text-sm font-bold mb-1">✓ 利用者に保存しました</div>
              <Link href={`/clients/${savedClientId}`} className="text-sky-400 text-sm underline">
                利用者ページで見る →
              </Link>
            </div>
          ) : (
            <div
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #334155" }}
            >
              <div className="text-slate-200 font-bold text-sm">利用者に保存</div>
              <select
                value={targetClientId}
                onChange={(e) => setTargetClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none"
                style={{ border: "1px solid #334155" }}
              >
                <option value="">＋ 新しい利用者として保存</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code}様
                  </option>
                ))}
              </select>
              {!targetClientId && (
                <input
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="氏名（任意・暗号化して保存／画面は記号で表示）"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none"
                  style={{ border: "1px solid #334155" }}
                />
              )}
              <button
                type="button"
                onClick={saveBundle}
                disabled={saving}
                className="px-4 py-2 rounded-xl text-white text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
              >
                {saving ? "保存中…" : "この利用者に5帳票を保存"}
              </button>
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setBundle(null);
                setError(null);
              }}
              className="flex-1 py-3.5 rounded-2xl border border-slate-600 bg-transparent text-slate-100 text-sm font-bold cursor-pointer hover:bg-slate-800 transition-colors"
            >
              ✏️ 別の人物像で作り直す
            </button>
            <button
              type="button"
              onClick={copyAll}
              className="flex-1 py-3.5 rounded-2xl border-none text-white text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
            >
              {copiedKey === "all" ? "✓ コピーしました" : "📋 一式をまとめてコピー"}
            </button>
          </div>

          {DOC_ORDER.map(({ key, icon, label }) => (
            <section
              key={key}
              className="rounded-2xl p-4 space-y-3"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #334155" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-slate-100 font-black text-base">
                  {icon} {label}
                </h2>
                <button
                  type="button"
                  onClick={() => copyDoc(key)}
                  className="px-3 py-1.5 rounded-lg border border-slate-600 bg-transparent text-slate-200 text-xs font-bold cursor-pointer hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  {copiedKey === key ? "✓ コピー済" : "📋 コピー"}
                </button>
              </div>
              <div className="space-y-3">
                <DocView docKey={key} bundle={bundle} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
