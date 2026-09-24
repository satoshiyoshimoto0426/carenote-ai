"use client";

import { useState } from "react";
import DocTypeTabs, { docTabId } from "@/components/create/DocTypeTabs";
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
import { IconAlert, IconCheck, IconCopy, IconLoader } from "@/components/ui/icons";
import {
  btnPrimary,
  btnSecondary,
  inputClass,
  PageHeader,
  Pane,
  TextAction,
} from "@/components/ui/primitives";
import { DOC_TYPE_LABELS } from "@/lib/create/docTypes";
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
import type { CareDocumentType } from "@/types/document";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";

/** 作る書類の種類（保存する書類の種類と同じ5種類）。 */
type DocType = CareDocumentType;

type GeneratedResult =
  | { type: "carePlan"; draft: CarePlanDraft }
  | { type: "assessment"; draft: AssessmentDraft }
  | { type: "monitoring"; draft: MonitoringDraft }
  | { type: "meetingSummary"; draft: MeetingSummaryDraft }
  | { type: "supportLog"; draft: SupportLogDraft };

/** 書類の種類のタブ（DocTypeTabs）が指す、タブの中身の要素の id（aria-controls）。 */
const PANEL_ID = "create-panel";

/**
 * 欄の名前。A案のアートボードの「会議のメモ」と同じ小見出しの見た目（globals.css の .section-label ──
 * 12px の太字・字間 0.06em・--ink-2）。components/create/NotesField.tsx の欄の名前と揃える。
 */
const labelClass = "section-label mb-2 block";

/** エラーの帯（レンガ色・globals.css の .create-error）。入力の段と送る前の段で同じ形にする。 */
function ErrorNote({ message }: { message: string }) {
  return (
    <div className="create-error">
      <IconAlert size={16} className="mt-[3px] shrink-0" />
      <p>{message}</p>
    </div>
  );
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

/**
 * つくる（/create）── メモから書類1種類の下書きを作る画面。
 *
 * なぜ存在するか: ケアマネが面談・会議・電話のメモ（録音から起こした文章を含む）を書類の形に整える手間を減らすため。
 * 流れは3段: ①入力（書類の種類のタブ・利用者の基本情報・メモ）→ ②送る前に見る（/api/preview が黒塗りした
 * 「AIに送る文章」を components/drafts/PreSendPreview で見せる。AI はまだ呼ばない）→ ③結果（/api/generate の下書きを
 * components/drafts/*View で表示し、職員がコピーして確定する。保存はしない）。
 * 何と繋がるか: 種類の並びと名前 = lib/create/docTypes.ts、タブ = components/create/DocTypeTabs.tsx、
 * メモ欄と録音・文字起こし = components/create/NotesField.tsx、実名の表示 = /api/clients/aliases（画面とコピーだけ）。
 * 一式まとめて（救済モード）へは、タブの行の右端のリンクから /rescue へ行く。
 * テスト: app/(dashboard)/create/page.test.tsx（最初に描いたときのタブと一式まとめてのリンク）。
 */
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

  /*
   * A案「作業台」の見た目（R1・2026-09-24）: 画面いっぱいの区画1つの中に、見出し → 書類の種類のタブの行 →
   * 中身を上から並べる。カードは積まず、1px の線だけで区切る（寸法と色は globals.css の .create-*）。
   * 流れ（入力 → 送る前に見る → 結果）・押したときの動き・画面の文字は以前のまま。入力と「AIに送る文章」を
   * 左右に分けるのは計画 C4 ── 送る直前の文章を固定する仕組みと一緒でないと、確かめていない文章が送れてしまうため。
   */
  return (
    <div className="panes">
      <Pane label="つくる">
        <div className="create-head">
          <PageHeader
            title="帳票作成（下書き）"
            description="メモを入力すると、AIがルールに沿って帳票の下書きを作成します"
            helpAnchor="ch3"
          />
        </div>

        {/*
          書類の種類（文字のタブ）と、一式まとめて（救済モード）への入口。左の帯から救済モードの項目が
          無くなった（ナビ4項目・2026-09-23）ので、ここから行けるようにする。リンクはタブの並び（tablist）の外に置く。
        */}
        <div className="create-tabbar">
          <DocTypeTabs value={docType} onSelect={switchDocType} panelId={PANEL_ID} />
          <TextAction href="/rescue" className="create-bundle-link">
            一式まとめて（救済モード）
          </TextAction>
        </div>

        <div
          id={PANEL_ID}
          role="tabpanel"
          aria-labelledby={docTabId(docType)}
          className="create-panel"
        >
          {preview && !result ? (
            <div className="create-col space-y-4">
              <PreSendPreview
                data={preview}
                loading={loading}
                onBack={() => setPreview(null)}
                onConfirm={sendToAi}
                primaryClass={btnPrimary}
                secondaryClass={btnSecondary}
              />
              {error && <ErrorNote message={error} />}
            </div>
          ) : !result ? (
            <div className="create-col animate-fadeIn space-y-5">
              <p className="text-[13px] text-[var(--muted)]">
                {DOC_TYPE_LABELS[docType].description}
              </p>

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
                  label={
                    docType === "carePlan" ? "アセスメント・面談メモ" : "面談メモ・収集した情報"
                  }
                  required
                  value={assessmentNotes}
                  onChange={setAssessmentNotes}
                  rows={10}
                  placeholder="利用者・家族との面談で得た情報、生活状況、困りごと、本人の希望などを自由に入力してください。録音から文字にすることもできます。"
                  transcribe={entryFor(setAssessmentNotes, "assessment")}
                />
              )}

              {error && <ErrorNote message={error} />}

              {/*
                2026-09-16: 横幅いっぱいの濃い緑のボタンをやめ、自然な幅で右下に置く。
                全幅の塗りボタンは重く古く見えるうえ、押す場所が視線の終点にならない。
                左側には「送る前に必ず確認画面が出る」ことを添えて、押す不安を減らす。
                A案（R1）: 上に 1px の線を引いた送る場所の行にする（アートボードの送る帯と同じ並び・主ボタンは右の端）。
              */}
              <div className="create-actions">
                <p className="mr-auto text-xs text-[var(--muted)]">
                  押しても、すぐには送られません。送る前に確認画面が出ます。
                </p>
                <button type="button" onClick={generate} disabled={loading} className={btnPrimary}>
                  {loading ? (
                    <>
                      <IconLoader size={16} className="animate-spin" />
                      送る文章を確認中…
                    </>
                  ) : (
                    `${DOC_TYPE_LABELS[docType].tab}の下書きを作る`
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-fadeIn">
              {/* 下書き注意（注意の黄色の帯。区画の端から端まで） */}
              <div className="create-band create-band-caution">
                <IconAlert size={15} className="mt-[4px] shrink-0 text-[var(--amber)]" />
                <p className="font-medium">
                  これはAIの下書きです。必ず内容を確認・修正のうえでご使用ください。
                </p>
              </div>

              {/* 二枚方式: 記号（A様）のまま見るか、手元で実名に戻して見るか */}
              <div className="create-row">
                <div>
                  <p className="text-[13.5px] font-medium">
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

              <div className="create-col">
                {shown?.type === "carePlan" && <CarePlanDraftView draft={shown.draft} />}
                {shown?.type === "assessment" && <AssessmentDraftView draft={shown.draft} />}
                {/* カイポケ転記用: 10ページの欄に合わせた文章（コピー貼り付け／拡張でページ単位の流し込み） */}
                {result?.type === "assessment" && (
                  <div className="draft-section">
                    {kaipokeSheet ? (
                      <KaipokeSheetView
                        sheet={kaipokeSheet}
                        // 緑の主ボタンは1画面に1つ（下の「下書きをコピー」）。この中のボタンは脇のボタンの見た目にする
                        primaryClass={btnSecondary}
                        secondaryClass={btnSecondary}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        <div>
                          <p className="section-label">カイポケに写すときは</p>
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
                {shown?.type === "meetingSummary" && (
                  <MeetingSummaryDraftView draft={shown.draft} />
                )}
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

                {/* Actions（主ボタンは右の端。すぐ上の欄が線で終わるので、線は重ねない） */}
                <div className="create-actions create-actions-flush">
                  <button
                    type="button"
                    onClick={() => {
                      setResult(null);
                      setError(null);
                    }}
                    className={btnSecondary}
                  >
                    別の下書きを作る
                  </button>
                  <button type="button" onClick={copyDraft} className={btnPrimary}>
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
            </div>
          )}
        </div>
      </Pane>
    </div>
  );
}
