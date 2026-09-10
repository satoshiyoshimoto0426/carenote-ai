"use client";

import { type ComponentType, useState } from "react";
import AppointmentsPanel from "@/components/drafts/AppointmentsPanel";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import AssessmentUpdatesPanel from "@/components/drafts/AssessmentUpdatesPanel";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import ItemsToConfirm from "@/components/drafts/ItemsToConfirm";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import PreSendPreview, { type PreviewData } from "@/components/drafts/PreSendPreview";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconFileText,
  IconLayers,
  IconLoader,
  type IconProps,
  IconSearch,
  IconUsers,
} from "@/components/ui/icons";
import {
  btnPrimary,
  btnSecondary,
  Card,
  inputClass,
  PageHeader,
  textareaClass,
} from "@/components/ui/primitives";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "@/lib/draftText";
import { type NameAlias, restoreNamesDeep } from "@/lib/privacy/pseudonymize";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";

type DocType = "carePlan" | "assessment" | "monitoring" | "meetingSummary" | "supportLog";

type GeneratedResult =
  | { type: "carePlan"; draft: CarePlanDraft }
  | { type: "assessment"; draft: AssessmentDraft }
  | { type: "monitoring"; draft: MonitoringDraft }
  | { type: "meetingSummary"; draft: MeetingSummaryDraft }
  | { type: "supportLog"; draft: SupportLogDraft };

const DOC_META: Record<
  DocType,
  { icon: ComponentType<IconProps>; label: string; description: string }
> = {
  assessment: {
    icon: IconSearch,
    label: "アセスメント",
    description: "面談メモから課題分析の下書き",
  },
  carePlan: {
    icon: IconFileText,
    label: "ケアプラン（第1・2表）",
    description: "アセス結果から計画書の下書き",
  },
  monitoring: {
    icon: IconCheck,
    label: "モニタリング",
    description: "前回プラン＋最新状況から記録の下書き",
  },
  meetingSummary: {
    icon: IconUsers,
    label: "担当者会議（第4表）",
    description: "会議メモから要点の下書き",
  },
  supportLog: {
    icon: IconLayers,
    label: "支援経過（第5表）",
    description: "対応メモから経過記録の下書き",
  },
};

/** ケアマネジメントの流れ順に表示する */
const DOC_ORDER: DocType[] = [
  "assessment",
  "carePlan",
  "meetingSummary",
  "supportLog",
  "monitoring",
];

/** ラベルは常に入力の上・12px・muted（Field と同じ見た目。必須マーク併用のため手書き） */
const labelClass = "mb-1.5 block text-xs font-medium text-[var(--muted)]";

/** 必須マーク（clay） */
function Req() {
  return <span className="text-[var(--clay)]"> *</span>;
}

function resultToText(result: GeneratedResult): string {
  switch (result.type) {
    case "carePlan":
      return carePlanToText(result.draft);
    case "assessment":
      return assessmentToText(result.draft);
    case "monitoring":
      return monitoringToText(result.draft);
    case "meetingSummary":
      return meetingSummaryToText(result.draft);
    case "supportLog":
      return supportLogToText(result.draft);
  }
}

export default function CreatePage() {
  const [docType, setDocType] = useState<DocType>("carePlan");
  const [clientInfo, setClientInfo] = useState("");
  const [assessmentNotes, setAssessmentNotes] = useState("");
  const [previousPlanSummary, setPreviousPlanSummary] = useState("");
  const [monitoringNotes, setMonitoringNotes] = useState("");
  const [meetingNotes, setMeetingNotes] = useState("");
  const [supportNotes, setSupportNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [copied, setCopied] = useState(false);
  /** 送る前に見る画面（第2段）。null なら入力画面。 */
  const [preview, setPreview] = useState<PreviewData | null>(null);
  /** フル版表示（二枚方式）: 記号→実名の対応表は初回の切替時にだけ取り寄せる */
  const [showRealNames, setShowRealNames] = useState(false);
  const [aliases, setAliases] = useState<NameAlias[] | null>(null);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const toggleRealNames = async () => {
    if (showRealNames) {
      setShowRealNames(false);
      return;
    }
    if (aliases === null) {
      try {
        const resp = await fetch("/api/clients/aliases");
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
        setAliases(data as NameAlias[]);
        setAliasError(null);
      } catch (e: unknown) {
        setAliasError(e instanceof Error ? e.message : "対応表を読み込めませんでした");
        return;
      }
    }
    setShowRealNames(true);
  };

  /** 第3段: 録音ファイル→文字（外部サービス）。結果は支援メモに足し、通常の「送る前に見る」へ乗せる */
  const [transcribing, setTranscribing] = useState(false);
  const transcribeFile = async (file: File) => {
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/transcribe", { method: "POST", body: form });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      const text = String(data.text ?? "").trim();
      setSupportNotes((prev) =>
        prev.trim() ? `${prev.trim()}\n\n【録音の文字起こし】\n${text}` : text,
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "文字起こしに失敗しました");
    } finally {
      setTranscribing(false);
    }
  };

  /** 画面とコピーに使う版。保存する帳票は記号のまま（restoreNamesDeep は表示専用） */
  const shown: GeneratedResult | null =
    result && showRealNames && aliases
      ? ({ ...result, draft: restoreNamesDeep(result.draft, aliases) } as GeneratedResult)
      : result;

  /** 帳票種別に応じた送信本文（/api/preview と /api/generate で同じものを使う） */
  const buildPayload = (): Record<string, string> => {
    const payload: Record<string, string> = { documentType: docType, clientInfo };
    if (docType === "monitoring") {
      payload.previousPlanSummary = previousPlanSummary;
      payload.monitoringNotes = monitoringNotes;
    } else if (docType === "meetingSummary") {
      payload.meetingNotes = meetingNotes;
    } else if (docType === "supportLog") {
      payload.supportNotes = supportNotes;
    } else {
      payload.assessmentNotes = assessmentNotes;
    }
    return payload;
  };

  /** 職員が確認したあとにAIへ送り、下書きを作る（第2段の「この内容で送る」）。 */
  const sendToAi = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setResult({ type: docType, draft: data } as GeneratedResult);
      setPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

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
    } else if (docType === "meetingSummary") {
      if (!meetingNotes.trim()) {
        setError("サービス担当者会議のメモを入力してください。");
        return;
      }
    } else if (docType === "supportLog") {
      if (!supportNotes.trim()) {
        setError("支援の対応メモを入力してください。");
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

    // 第2段（送る前に見る）: まず黒塗り後の文章を取り寄せて画面に出す。AIへはまだ送らない。
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setPreview(data as PreviewData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const copyDraft = async () => {
    if (!shown) return;
    await navigator.clipboard.writeText(resultToText(shown));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        kicker="Create"
        title="帳票作成（下書き）"
        description="メモを入力すると、AIがルールに沿って帳票の下書きを作成します"
      />

      {/* 帳票セレクタ（白カードのセグメント） */}
      <Card className="mb-6 p-1.5">
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
          {DOC_ORDER.map((t) => {
            const meta = DOC_META[t];
            const Icon = meta.icon;
            const active = docType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => switchDocType(t)}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[10px] px-2 py-3 text-center transition-colors ${
                  active
                    ? "bg-[var(--green-soft)] text-[var(--green)]"
                    : "text-[var(--muted)] hover:bg-[var(--paper)]"
                }`}
              >
                <Icon size={18} />
                <span className="text-xs font-medium leading-tight">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {preview && !result ? (
        <div className="space-y-4">
          <PreSendPreview
            data={preview}
            loading={loading}
            onBack={() => setPreview(null)}
            onConfirm={sendToAi}
            primaryClass={btnPrimary}
            secondaryClass={btnSecondary}
          />
          {error && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-[var(--clay)] bg-white p-4">
              <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--clay)]" />
              <p className="text-sm text-[var(--clay)]">{error}</p>
            </div>
          )}
        </div>
      ) : !result ? (
        <div className="animate-fadeIn space-y-4">
          <p className="-mt-2 text-xs text-[var(--faint)]">{DOC_META[docType].description}</p>

          <div>
            <label htmlFor="clientInfo" className={labelClass}>
              利用者の基本情報（任意）
            </label>
            <input
              id="clientInfo"
              type="text"
              value={clientInfo}
              onChange={(e) => setClientInfo(e.target.value)}
              placeholder="例: 85歳 女性 要介護2 独居"
              className={inputClass}
            />
          </div>

          {docType === "monitoring" ? (
            <>
              <div>
                <label htmlFor="previousPlanSummary" className={labelClass}>
                  前回のケアプラン（目標・サービスの要約）
                  <Req />
                </label>
                <textarea
                  id="previousPlanSummary"
                  value={previousPlanSummary}
                  onChange={(e) => setPreviousPlanSummary(e.target.value)}
                  rows={6}
                  placeholder="前回プランの短期目標・長期目標・サービス内容を貼り付けるか、要約して入力してください。"
                  className={`${textareaClass} resize-y`}
                />
              </div>
              <div>
                <label htmlFor="monitoringNotes" className={labelClass}>
                  最新の状況・モニタリングメモ
                  <Req />
                </label>
                <textarea
                  id="monitoringNotes"
                  value={monitoringNotes}
                  onChange={(e) => setMonitoringNotes(e.target.value)}
                  rows={8}
                  placeholder="訪問・電話で確認した最新の様子、本人や家族・事業所からの聞き取り内容を入力してください。"
                  className={`${textareaClass} resize-y`}
                />
              </div>
            </>
          ) : docType === "supportLog" ? (
            <div>
              <label htmlFor="supportNotes" className={labelClass}>
                支援の対応メモ（訪問・電話・調整など）
                <Req />
              </label>
              <textarea
                id="supportNotes"
                value={supportNotes}
                onChange={(e) => setSupportNotes(e.target.value)}
                rows={10}
                placeholder="電話なら SecondBrain の文字起こし「全文」を貼り付けてください（要約ではなく全文）。手書きメモや複数日の対応が混ざっていてもOK（自動で分割します）。"
                className={`${textareaClass} resize-y`}
              />
              {/* 第3段: 電話の録音を文字にしてメモへ足す（音声は保存しない・文字はこのあと黒塗りを通る） */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                <label
                  htmlFor="callAudio"
                  className={`${btnSecondary} cursor-pointer ${transcribing ? "pointer-events-none opacity-60" : ""}`}
                >
                  {transcribing ? "文字にしています…（1〜2分）" : "録音ファイルから文字にする"}
                </label>
                <input
                  id="callAudio"
                  type="file"
                  accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,audio/*"
                  className="hidden"
                  disabled={transcribing}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) transcribeFile(f);
                    e.target.value = "";
                  }}
                />
                <span>
                  25MBまで。音声は保存せず、文字にしたあと通常の「送る前に確認」を通ります。
                </span>
              </div>
            </div>
          ) : docType === "meetingSummary" ? (
            <div>
              <label htmlFor="meetingNotes" className={labelClass}>
                サービス担当者会議のメモ
                <Req />
              </label>
              <textarea
                id="meetingNotes"
                value={meetingNotes}
                onChange={(e) => setMeetingNotes(e.target.value)}
                rows={10}
                placeholder="開催日時・場所、出席者、会議で出た発言・報告・決定事項などのメモ（殴り書きでOK）を貼り付けてください。"
                className={`${textareaClass} resize-y`}
              />
            </div>
          ) : (
            <div>
              <label htmlFor="assessmentNotes" className={labelClass}>
                {docType === "carePlan" ? "アセスメント・面談メモ" : "面談メモ・収集した情報"}
                <Req />
              </label>
              <textarea
                id="assessmentNotes"
                value={assessmentNotes}
                onChange={(e) => setAssessmentNotes(e.target.value)}
                rows={10}
                placeholder="利用者・家族との面談で得た情報、生活状況、困りごと、本人の希望などを自由に入力してください。"
                className={`${textareaClass} resize-y`}
              />
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-[var(--clay)] bg-white p-4">
              <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--clay)]" />
              <p className="text-sm text-[var(--clay)]">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className={`${btnPrimary} w-full`}
          >
            {loading ? (
              <>
                <IconLoader size={16} className="animate-spin" />
                送る文章を確認中…
              </>
            ) : (
              `${DOC_META[docType].label}の下書きを生成する（送る前に確認）`
            )}
          </button>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-4">
          {/* 下書き注意 */}
          <div className="flex items-start gap-2.5 rounded-[12px] border border-[var(--amber)] bg-[var(--amber-soft)] p-3.5">
            <IconAlert size={16} className="mt-0.5 shrink-0 text-[#7A5B1E]" />
            <p className="text-sm font-medium text-[#7A5B1E]">
              これはAIの下書きです。必ず内容を確認・修正のうえでご使用ください。
            </p>
          </div>

          {/* 二枚方式: 記号（A様）のまま見るか、手元で実名に戻して見るか */}
          <div className="flex items-center justify-between rounded-[12px] border border-[var(--paper)] bg-white px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {showRealNames ? "実名で表示しています" : "記号（A様）で表示しています"}
              </p>
              <p className="text-xs text-[var(--muted)]">
                実名は画面とコピーにだけ使い、AIには送っていません。
              </p>
              {aliasError && <p className="mt-1 text-xs text-[var(--clay)]">{aliasError}</p>}
            </div>
            <button type="button" onClick={toggleRealNames} className={btnSecondary}>
              {showRealNames ? "記号で表示" : "実名で表示"}
            </button>
          </div>

          {shown?.type === "carePlan" && <CarePlanDraftView draft={shown.draft} />}
          {shown?.type === "assessment" && <AssessmentDraftView draft={shown.draft} />}
          {shown?.type === "monitoring" && <MonitoringDraftView draft={shown.draft} />}
          {shown?.type === "meetingSummary" && <MeetingSummaryDraftView draft={shown.draft} />}
          {shown?.type === "supportLog" && <SupportLogDraftView draft={shown.draft} />}
          {/* 第4段: 予定は記号版（result）から作る。実名で表示中でもカレンダーへ実名は渡さない */}
          {result?.type === "supportLog" && (
            <AppointmentsPanel
              appointments={result.draft.appointments ?? []}
              secondaryClass={btnSecondary}
            />
          )}
          {/* 第5段: アセスメント欄への追記案（表示・コピーのみ。書き込みは人／拡張の追記モード） */}
          {shown?.type === "supportLog" && (
            <AssessmentUpdatesPanel
              updates={shown.draft.assessmentUpdates ?? []}
              secondaryClass={btnSecondary}
            />
          )}

          {shown && <ItemsToConfirm items={shown.draft.itemsToConfirm} />}

          {/* Actions */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              className={`${btnSecondary} flex-1`}
            >
              別の下書きを作る
            </button>
            <button type="button" onClick={copyDraft} className={`${btnPrimary} flex-1`}>
              {copied ? (
                <>
                  <IconCheck size={16} />
                  コピーしました
                </>
              ) : (
                <>
                  <IconCopy size={16} />
                  下書きをコピー
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
