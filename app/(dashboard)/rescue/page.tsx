"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  type ChangeEvent,
  type DragEvent,
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconCopy,
  IconFileText,
  IconLayers,
  IconLoader,
  IconTrash,
  IconUpload,
} from "@/components/ui/icons";
import {
  btnPrimary,
  btnSecondary,
  Card,
  Field,
  inputClass,
  PageHeader,
  SectionTitle,
  textareaClass,
} from "@/components/ui/primitives";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "@/lib/draftText";
import type { RescueBundle } from "@/lib/generation/rescue";
import type { IntakeResult } from "@/lib/generation/rescueIntake";
import type { ClientRecord } from "@/types/client";

type DocKey = keyof RescueBundle;

/**
 * /api/rescue 契約の追加分。sourceDocs = Vercel Blob にアップロード済みPDF、
 * intake = 提供書類のAI統合読解（lib/generation/rescueIntake の IntakeResult）。
 */
type SourceDoc = { name: string; url: string };
type RescueResponse = RescueBundle & { intake?: IntakeResult };

/** 参考資料PDFのクライアント側上限（API契約: sourceDocs 最大5件・1件10MB目安）。 */
const MAX_SOURCE_DOCS = 5;
const MAX_SOURCE_DOC_MB = 10;

/** 時系列入力の記入例（1行1出来事）。 */
const TIMELINE_PLACEHOLDER = [
  "2026/4 長女より電話相談（退院がきっかけ）",
  "4/10 初回訪問・契約",
  "4/15 サービス担当者会議",
  "5月 自宅で転倒、通所を週2に増回",
].join("\n");

/** 表示順とラベル（ケアマネジメントの流れ順）。 */
const DOC_ORDER: { key: DocKey; label: string }[] = [
  { key: "assessment", label: "アセスメント（課題分析）" },
  { key: "carePlan", label: "ケアプラン 第1・2表" },
  { key: "meetingSummary", label: "第4表 サービス担当者会議の要点" },
  { key: "supportLog", label: "第5表 支援経過" },
  { key: "monitoring", label: "モニタリング" },
];

/** 帳票カード内のコピー用・小さめのセカンダリボタン（primitives の小サイズ版）。 */
const btnSecondarySmall =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] border " +
  "border-[#E0DBD2] bg-white px-3 py-1.5 text-xs font-medium text-[var(--ink)] " +
  "transition-colors hover:bg-[var(--paper)]";

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

/** 救済モード共通の注意書き。amber の左ボーダー帯（下書き・要事実照合の明示）。 */
function AmberNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-r-[10px] border-l-4 border-[var(--amber)] bg-[var(--amber-soft)] px-4 py-3">
      <p className="text-xs leading-relaxed text-[#7A5B1E]">{children}</p>
    </div>
  );
}

/** エラー表示帯。clay の枠＋アイコンで明瞭に。 */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] border border-[var(--clay)] bg-white px-4 py-3">
      <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--clay)]" />
      <p className="text-sm leading-relaxed text-[var(--clay)]">{message}</p>
    </div>
  );
}

export default function RescuePage() {
  const [persona, setPersona] = useState<PersonaForm>(EMPTY_PERSONA);
  const [timeline, setTimeline] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("一式を作成中です…");
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<RescueBundle | null>(null);
  const [intake, setIntake] = useState<IntakeResult | null>(null);
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

  // 参考資料PDFの選択（クリック・ドロップ共通）。PDF以外/10MB超/6件目以降は弾く
  const addFiles = (incoming: File[]) => {
    setError(null);
    const next = [...files];
    for (const f of incoming) {
      if (f.type !== "application/pdf") {
        setError("参考資料はPDFファイルのみ追加できます。");
        continue;
      }
      const mb = f.size / 1024 / 1024;
      if (mb > MAX_SOURCE_DOC_MB) {
        setError(
          `「${f.name}」が大きすぎます（${mb.toFixed(1)}MB）。1件${MAX_SOURCE_DOC_MB}MB以下を目安にしてください。`,
        );
        continue;
      }
      if (next.some((x) => x.name === f.name && x.size === f.size)) continue;
      if (next.length >= MAX_SOURCE_DOCS) {
        setError(`参考資料は最大${MAX_SOURCE_DOCS}件までです。`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = ""; // 同じファイルの再選択を許可
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const generate = async () => {
    const hasContent = PERSONA_FIELDS.some((f) => persona[f.key].trim() !== "");
    // 契約どおり「人物像1項目以上 or 資料1件以上」で生成可（資料だけでも生成できる）
    if (!hasContent && files.length === 0) {
      setError("利用者の人物像を1つ以上入力するか、参考資料（PDF）を1件以上追加してください。");
      return;
    }
    setLoading(true);
    setError(null);
    setBundle(null);
    setIntake(null);
    try {
      // ── Step 1: 参考資料を Vercel Blob へアップロード（evaluate と同じ経路） ──
      let sourceDocs: SourceDoc[] | undefined;
      if (files.length > 0) {
        setLoadingMsg("資料を読み取り中…");
        try {
          const uploaded: SourceDoc[] = [];
          for (const f of files) {
            const blob = await upload(f.name, f, {
              access: "public",
              handleUploadUrl: "/api/blob-upload",
            });
            uploaded.push({ name: f.name, url: blob.url });
          }
          sourceDocs = uploaded;
        } catch {
          throw new Error(
            "資料のアップロードに失敗しました。通信環境を確認して再度お試しください。",
          );
        }
      }

      // ── Step 2: 一式生成（timeline / sourceDocs を人物像に添えて送る） ──
      setLoadingMsg("一式を作成中です…");
      const resp = await fetch("/api/rescue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...persona,
          timeline: timeline.trim() !== "" ? timeline : undefined,
          sourceDocs,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      const result = data as RescueResponse;
      setIntake(result.intake ?? null);
      setBundle(result);
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
    <div className="mx-auto max-w-2xl">
      <PageHeader
        kicker="救済モード"
        title="書類一式をつくる"
        description="利用者の人物像・診療情報などを入力すると、アセスメントからモニタリングまで5帳票の下書きを一括で作成します。"
      />

      {!bundle ? (
        <div className="animate-fadeIn space-y-6">
          <AmberNotice>
            救済モードは、情報が不足する部分もAIが想定して
            <strong className="font-semibold">完成形まで仕上げます</strong>
            。生成物は下書きです。
            <strong className="font-semibold">
              必ず事実と照合し、ケアマネジャーが確認・修正のうえ
            </strong>
            ご使用ください。
          </AmberNotice>

          <Field label="利用者の基本情報（任意）" htmlFor="clientInfo">
            <input
              id="clientInfo"
              type="text"
              value={persona.clientInfo}
              onChange={(e) => setField("clientInfo", e.target.value)}
              placeholder="例: 85歳 女性 要介護2 独居"
              className={inputClass}
            />
          </Field>

          <div className="border-t border-[var(--line-soft)] pt-5">
            <SectionTitle>分かる項目だけでOK（1つ以上）</SectionTitle>
            <p className="mt-1.5 text-xs text-[var(--faint)]">
              空欄はAIが人物像から想定して補います。
            </p>
          </div>

          {PERSONA_FIELDS.map((field) => (
            <Fragment key={field.key}>
              <Field label={field.label} htmlFor={`f-${field.key}`}>
                <textarea
                  id={`f-${field.key}`}
                  value={persona[field.key]}
                  onChange={(e) => setField(field.key, e.target.value)}
                  rows={field.rows}
                  placeholder={field.placeholder}
                  className={`${textareaClass} resize-y`}
                />
              </Field>
              {field.key === "intentions" && (
                <div>
                  <label
                    htmlFor="f-timeline"
                    className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]"
                  >
                    <IconClock size={13} />
                    関わりの経過・時系列（任意）
                  </label>
                  <textarea
                    id="f-timeline"
                    value={timeline}
                    onChange={(e) => setTimeline(e.target.value)}
                    rows={4}
                    placeholder={TIMELINE_PLACEHOLDER}
                    className={`${textareaClass} resize-y`}
                  />
                  <p className="mt-1.5 text-xs text-[var(--faint)]">
                    1行に1つの出来事を、日付から書いてください。支援経過・モニタリングの下書きに反映されます。
                  </p>
                </div>
              )}
            </Fragment>
          ))}

          <div className="space-y-4 border-t border-[var(--line-soft)] pt-5">
            <div>
              <SectionTitle>参考資料（PDF・任意）</SectionTitle>
              <p className="mt-1.5 text-xs text-[var(--faint)]">
                主治医意見書・診療情報提供書などのPDFを最大{MAX_SOURCE_DOCS}件（1件
                {MAX_SOURCE_DOC_MB}MB目安）。AIが内容を統合して下書きに反映します。
              </p>
            </div>

            <AmberNotice>
              契約前は実在の方の書類はアップロードしないでください（
              <strong className="font-semibold">テスト用・マスキング済みのみ</strong>
              ）。書類は生成後すぐ削除されます。
            </AmberNotice>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="参考資料のPDFを選択、またはドラッグ＆ドロップ"
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-colors duration-300 ${
                dragOver
                  ? "border-[var(--green)] bg-[var(--green-soft)]"
                  : "border-[#CFC9BE] bg-white hover:border-[var(--green)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mb-2 flex justify-center text-[var(--faint)]">
                <IconUpload size={26} />
              </div>
              <div className="text-sm font-semibold text-[var(--ink)]">PDFをドラッグ＆ドロップ</div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                またはクリックしてファイルを選択（複数可）
              </div>
            </div>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="flex items-center gap-2.5 rounded-[10px] border border-[var(--line)] bg-white px-3.5 py-2.5"
                  >
                    <IconFileText size={16} className="shrink-0 text-[var(--green)]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                      {f.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--faint)]">
                      {(f.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      aria-label={`${f.name} を削除`}
                      className="shrink-0 rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--clay)]"
                    >
                      <IconTrash size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error && <ErrorNotice message={error} />}

          <div className="flex flex-wrap items-center gap-4 pt-1">
            <button type="button" onClick={generate} disabled={loading} className={btnPrimary}>
              {loading ? (
                <>
                  <IconLoader size={16} className="animate-spin" />
                  {loadingMsg}
                </>
              ) : (
                <>
                  <IconLayers size={16} />
                  書類一式を生成する
                </>
              )}
            </button>
            <p className="text-xs text-[var(--faint)]">5帳票・30秒〜2分ほど</p>
          </div>
        </div>
      ) : (
        <div className="animate-fadeIn space-y-5">
          {intake && (
            <Card className="space-y-3 p-6">
              <SectionTitle>提供書類の読み取り（AI統合）</SectionTitle>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">
                {intake.summary}
              </p>
              {intake.cautions.length > 0 && (
                <div className="rounded-r-[10px] border-l-4 border-[var(--amber)] bg-[var(--amber-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[#7A5B1E]">要注意点</p>
                  <ul className="mt-1.5 space-y-1">
                    {intake.cautions.map((c) => (
                      <li
                        key={c}
                        className="flex items-start gap-1.5 text-xs leading-relaxed text-[#7A5B1E]"
                      >
                        <IconAlert size={13} className="mt-0.5 shrink-0" />
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}

          <AmberNotice>
            これは人物像から生成した下書き一式です。AIが想定で補った内容を含みます。
            <strong className="font-semibold">必ず事実と照合し、確認・修正のうえ</strong>
            でご使用ください。
          </AmberNotice>

          {/* 利用者に保存 */}
          {savedClientId ? (
            <div className="rounded-2xl border border-[var(--green-line)] bg-[var(--green-soft)] p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--green)]">
                <IconCheck size={16} />
                利用者に保存しました
              </p>
              <Link
                href={`/clients/${savedClientId}`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--green)] underline underline-offset-4 transition-colors hover:text-[#0F4A3B]"
              >
                利用者ページで見る
                <IconArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-[var(--green-line)] bg-[var(--green-soft)] p-5">
              <SectionTitle>利用者に保存</SectionTitle>
              <Field label="保存先の利用者" htmlFor="save-client">
                <select
                  id="save-client"
                  value={targetClientId}
                  onChange={(e) => setTargetClientId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">新しい利用者として保存</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}様
                    </option>
                  ))}
                </select>
              </Field>
              {!targetClientId && (
                <Field
                  label="氏名（任意）"
                  htmlFor="new-client-name"
                  hint="暗号化して保存し、画面には記号で表示されます"
                >
                  <input
                    id="new-client-name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="例: 山田 花子"
                    className={inputClass}
                  />
                </Field>
              )}
              {error && <ErrorNotice message={error} />}
              <button type="button" onClick={saveBundle} disabled={saving} className={btnPrimary}>
                {saving ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    保存中…
                  </>
                ) : (
                  "この利用者に5帳票を保存"
                )}
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setBundle(null);
                setIntake(null);
                setError(null);
              }}
              className={btnSecondary}
            >
              別の人物像で作り直す
            </button>
            <button type="button" onClick={copyAll} className={btnSecondary}>
              {copiedKey === "all" ? (
                <>
                  <IconCheck size={15} className="text-[var(--green)]" />
                  コピーしました
                </>
              ) : (
                <>
                  <IconCopy size={15} />
                  一式をまとめてコピー
                </>
              )}
            </button>
          </div>

          {DOC_ORDER.map(({ key, label }) => (
            <Card key={key} className="space-y-4 p-6">
              <div className="flex items-center justify-between gap-3">
                <SectionTitle>{label}</SectionTitle>
                <button type="button" onClick={() => copyDoc(key)} className={btnSecondarySmall}>
                  {copiedKey === key ? (
                    <>
                      <IconCheck size={14} className="text-[var(--green)]" />
                      コピー済
                    </>
                  ) : (
                    <>
                      <IconCopy size={14} />
                      コピー
                    </>
                  )}
                </button>
              </div>
              <div className="space-y-3">
                <DocView docKey={key} bundle={bundle} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
