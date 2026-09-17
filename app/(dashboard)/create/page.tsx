"use client";

import { type ComponentType, useState } from "react";
import NotesField from "@/components/create/NotesField";
import AppointmentsPanel from "@/components/drafts/AppointmentsPanel";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import AssessmentUpdatesPanel from "@/components/drafts/AssessmentUpdatesPanel";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import ItemsToConfirm from "@/components/drafts/ItemsToConfirm";
import KaipokeSheetView from "@/components/drafts/KaipokeSheetView";
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
import { btnPrimary, btnSecondary, Card, inputClass, PageHeader } from "@/components/ui/primitives";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "@/lib/draftText";
import type { KaipokeAssessmentSheet } from "@/lib/kaipoke/assessmentLayout";
import { type NameAlias, restoreNamesDeep } from "@/lib/privacy/pseudonymize";
import type { TranscriptKind } from "@/lib/privacy/transcriptInput";
import { appendTranscript } from "@/lib/transcribe/appendTranscript";
import { explainTranscribeError, validateAudio } from "@/lib/transcribe/validate";
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

  /**
   * 録音ファイル→文字（外部サービス）。結果は**押した欄**へ足し、通常の「送る前に見る」へ乗せる。
   *
   * append を引数で受け取るのは、同じ入口をアセスメント・担当者会議・モニタリング・支援経過の
   * 4つの欄で使うため（docs/specs/recording-pipeline.md R1）。行き先を固定すると他の欄を汚す。
   */
  const [transcribing, setTranscribing] = useState(false);
  const transcribeFile = async (file: File, append: (add: string) => void) => {
    // 送る前に、ここで大きさと形式を見る。
    // 上限を超えたものを投げると、アプリに届く前に置き場（Vercel）が英語の 413 を返し、
    // それを JSON として読もうとして英語の解析エラーが職員の画面に出る（2026-09-17 実測）。
    const check = validateAudio(file.name, file.size);
    if (!check.ok) {
      setError(check.reason);
      return;
    }
    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch("/api/transcribe", { method: "POST", body: form });
      // 置き場が断ったときは JSON が返らない。まず文字として受けてから読む
      const raw = await resp.text();
      let data: { text?: unknown; error?: unknown } = {};
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        if (resp.status === 413) throw new Error(explainTranscribeError(413, raw));
        throw new Error(`文字起こしに失敗しました（${resp.status}）。管理者に伝えてください。`);
      }
      if (!resp.ok)
        throw new Error(
          typeof data.error === "string" ? data.error : `エラーが発生しました (${resp.status})`,
        );
      append(String(data.text ?? "").trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "文字起こしに失敗しました");
    } finally {
      setTranscribing(false);
    }
  };

  /** 「この欄へ文字起こしを足す」入口を作る。busy は共通（同時に2つ走らせない）。 */
  const entryFor = (set: (update: (prev: string) => string) => void, kind: TranscriptKind) => ({
    busy: transcribing,
    onPick: (file: File) =>
      transcribeFile(file, (add) => set((prev) => appendTranscript(prev, add))),
    onText: (add: string) => set((prev) => appendTranscript(prev, add)),
    saveKind: kind,
  });

  /** カイポケ転記用シート（アセスメントの下書きを10ページの欄に組み替えたもの） */
  const [kaipokeSheet, setKaipokeSheet] = useState<KaipokeAssessmentSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const makeKaipokeSheet = async () => {
    if (!result || result.type !== "assessment") return;
    setSheetLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/kaipoke/assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: result.draft }), // 記号版を渡す（実名は送らない）
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setKaipokeSheet(data as KaipokeAssessmentSheet);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "カイポケ用の整形に失敗しました");
    } finally {
      setSheetLoading(false);
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
      setKaipokeSheet(null);
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
    <div className="app-page">
      <PageHeader
        title="帳票作成（下書き）"
        description="メモを入力すると、AIがルールに沿って帳票の下書きを作成します"
        helpAnchor="ch3"
      />

      {/* 帳票セレクタ（白カードのセグメント） */}
      <Card className="mb-[var(--sp-4)] p-2">
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {DOC_ORDER.map((t) => {
            const meta = DOC_META[t];
            const Icon = meta.icon;
            const active = docType === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => switchDocType(t)}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-[8px] px-2 py-3.5 text-center transition-colors ${
                  active
                    ? "bg-[var(--green-soft)] text-[var(--green)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                }`}
              >
                <Icon size={19} />
                <span className="text-[12.5px] font-bold leading-[1.5]">{meta.label}</span>
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
            <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--clay)] bg-[var(--clay-soft)] p-4">
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
              {/* 前回プランは録音では埋まらない（dispatch.ts が必須にしている）ので入口を出さない */}
              <NotesField
                id="previousPlanSummary"
                label="前回のケアプラン（目標・サービスの要約）"
                required
                value={previousPlanSummary}
                onChange={setPreviousPlanSummary}
                rows={6}
                placeholder="前回プランの短期目標・長期目標・サービス内容を貼り付けるか、要約して入力してください。"
              />
              <NotesField
                id="monitoringNotes"
                label="最新の状況・モニタリングメモ"
                required
                value={monitoringNotes}
                onChange={setMonitoringNotes}
                rows={8}
                placeholder="訪問・電話で確認した最新の様子、本人や家族・事業所からの聞き取り内容を入力してください。"
                transcribe={entryFor(setMonitoringNotes, "monitoring")}
              />
            </>
          ) : docType === "supportLog" ? (
            <NotesField
              id="supportNotes"
              label="支援の対応メモ（訪問・電話・調整など）"
              required
              value={supportNotes}
              onChange={setSupportNotes}
              rows={10}
              placeholder="録音ファイルから文字にするか、文字起こしの「全文」を貼り付けてください（要約ではなく全文）。手書きメモや複数日の対応が混ざっていてもOK（自動で分割します）。"
              transcribe={entryFor(setSupportNotes, "support")}
            />
          ) : docType === "meetingSummary" ? (
            <NotesField
              id="meetingNotes"
              label="サービス担当者会議のメモ"
              required
              value={meetingNotes}
              onChange={setMeetingNotes}
              rows={10}
              placeholder="開催日時・場所、出席者、会議で出た発言・報告・決定事項などのメモ（殴り書きでOK）を貼り付けてください。録音から文字にすることもできます。"
              transcribe={entryFor(setMeetingNotes, "meeting")}
            />
          ) : (
            <NotesField
              id="assessmentNotes"
              label={docType === "carePlan" ? "アセスメント・面談メモ" : "面談メモ・収集した情報"}
              required
              value={assessmentNotes}
              onChange={setAssessmentNotes}
              rows={10}
              placeholder="利用者・家族との面談で得た情報、生活状況、困りごと、本人の希望などを自由に入力してください。録音から文字にすることもできます。"
              transcribe={entryFor(setAssessmentNotes, "assessment")}
            />
          )}

          {error && (
            <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--clay)] bg-[var(--clay-soft)] p-4">
              <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--clay)]" />
              <p className="text-sm text-[var(--clay)]">{error}</p>
            </div>
          )}

          {/*
            2026-09-16: 横幅いっぱいの濃い緑のボタンをやめ、自然な幅で右下に置く。
            全幅の塗りボタンは重く古く見えるうえ、押す場所が視線の終点にならない。
            左側には「送る前に必ず確認画面が出る」ことを添えて、押す不安を減らす。
          */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
            <p className="mr-auto text-xs text-[var(--faint)]">
              押しても、すぐには送られません。送る前に確認画面が出ます。
            </p>
            <button type="button" onClick={generate} disabled={loading} className={btnPrimary}>
              {loading ? (
                <>
                  <IconLoader size={16} className="animate-spin" />
                  送る文章を確認中…
                </>
              ) : (
                `${DOC_META[docType].label}の下書きを作る`
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-4">
          {/* 下書き注意 */}
          <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--amber-line)] bg-[var(--amber-soft)] p-3.5">
            <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--amber)]" />
            <p className="text-sm font-medium text-[var(--amber)]">
              これはAIの下書きです。必ず内容を確認・修正のうえでご使用ください。
            </p>
          </div>

          {/* 二枚方式: 記号（A様）のまま見るか、手元で実名に戻して見るか */}
          <div className="flex items-center justify-between rounded-[10px] border border-[var(--line)] bg-[var(--card)] px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                {showRealNames ? (
                  "実名で表示しています"
                ) : (
                  <>
                    記号（<span className="code-chip">A様</span>）で表示しています
                  </>
                )}
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
          {/* カイポケ転記用: 10ページの欄に合わせた文章（コピー貼り付け／拡張でページ単位の流し込み） */}
          {result?.type === "assessment" && (
            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--card)] p-4">
              {kaipokeSheet ? (
                <KaipokeSheetView
                  sheet={kaipokeSheet}
                  primaryClass={btnPrimary}
                  secondaryClass={btnSecondary}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">カイポケに写すときは</p>
                    <p className="text-xs text-[var(--muted)]">
                      10ページの欄の順番・欄名・文字数に合わせた文章に組み替えます（欄ごとにコピーできます）。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={makeKaipokeSheet}
                    disabled={sheetLoading}
                    className={btnSecondary}
                  >
                    {sheetLoading ? "組み替え中…（30秒〜1分）" : "カイポケの欄に合わせる"}
                  </button>
                </div>
              )}
            </div>
          )}
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
