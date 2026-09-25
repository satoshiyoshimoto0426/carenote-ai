"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import {
  type ChangeEvent,
  type DragEvent,
  Fragment,
  type ReactNode,
  useRef,
  useState,
} from "react";
import AssessmentDraftView from "@/components/drafts/AssessmentDraftView";
import CarePlanDraftView from "@/components/drafts/CarePlanDraftView";
import MeetingSummaryDraftView from "@/components/drafts/MeetingSummaryDraftView";
import MonitoringDraftView from "@/components/drafts/MonitoringDraftView";
import SupportLogDraftView from "@/components/drafts/SupportLogDraftView";
import TempDeleteWarnings, { warningsOf } from "@/components/TempDeleteWarnings";
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
import { useClientList } from "@/lib/clients/useClientList";
import { DOC_ORDER, DOC_TYPE_LABELS } from "@/lib/create/docTypes";
import {
  assessmentToText,
  carePlanToText,
  meetingSummaryToText,
  monitoringToText,
  supportLogToText,
} from "@/lib/draftText";
import {
  INTAKE_CATEGORIES,
  INTAKE_DOC_TYPES,
  INTAKE_MEDIA_TYPES,
  type IntakeDocType,
  type IntakeResult,
} from "@/lib/generation/intakeTypes";
import type { RescueBundle } from "@/lib/generation/rescue";
import { type BundleSaveProgress, saveBundleDocuments } from "@/lib/rescue/saveBundle";
import { safeExtension } from "@/lib/rescue/sourceDocs";

/** 受け付ける資料の形式（blob-upload・rescueIntake と一致） */
const ACCEPTED_TYPES: readonly string[] = INTAKE_MEDIA_TYPES;

type DocKey = keyof RescueBundle;

/**
 * /api/rescue 契約の追加分。sourceDocs = Vercel Blob にアップロード済みPDF、
 * intake = 提供書類のAI統合読解（lib/generation/rescueIntake の IntakeResult）。
 */
type SourceDoc = { name: string; url: string; contentType: string; docType: IntakeDocType };
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

/**
 * 表示順とラベル（ケアマネジメントの流れ順）。順と名前の正本は lib/create/docTypes.ts
 * （この画面の見出しは DocTypeLabels の bundle）。
 */
const BUNDLE_DOCS: { key: DocKey; label: string }[] = DOC_ORDER.map((key) => ({
  key,
  label: DOC_TYPE_LABELS[key].bundle,
}));

/** 保存する順（表示順と同じ）。lib/rescue/saveBundle.ts へ渡す。 */
const DOC_KEYS: readonly DocKey[] = BUNDLE_DOCS.map((d) => d.key);

/** 帳票カード内のコピー用・小さめのセカンダリボタン（primitives の小サイズ版）。 */
const btnSecondarySmall =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[8px] border " +
  "border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] " +
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

/**
 * 救済モード共通の注意書き。注意の黄色（amber）の帯（下書き・要事実照合の明示）。
 * A案（R1・2026-09-24）で左だけ太い線の飾りをやめ、細い線で囲む帯にした（文字は以前のまま）。
 */
function AmberNotice({ children }: { children: ReactNode }) {
  return (
    <div className="border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3">
      <p className="text-xs leading-relaxed text-[var(--amber)]">{children}</p>
    </div>
  );
}

/** エラー表示帯。レンガ色（clay）の地＋細い線＋アイコンで明瞭に（A案 R1 で角の丸みを外した）。 */
function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 border border-[var(--clay-line)] bg-[var(--clay-soft)] px-4 py-3">
      <IconAlert size={16} className="mt-0.5 shrink-0 text-[var(--clay)]" />
      <p className="text-sm leading-relaxed text-[var(--clay)]">{message}</p>
    </div>
  );
}

/**
 * 救済モード（/rescue）。人物像・時系列・参考資料（PDF・画像 最大5件）から、アセスメント〜モニタリングの
 * 5帳票の下書きを一式で作り、表示・コピーし、選んだ（または新しい）利用者に保存する画面。
 *
 * なぜあるか: 書類が揃っていない方でも、手元の情報から一式の下書きをまとめて起こせるようにするため
 * （情報が足りない部分も AI が想定して埋めるので、画面の amber の注意書きで「下書き・事実の照合が要る」と伝える）。
 * 作り直し計画では「つくる」の「一式まとめて」へ移す予定（吉本さん決定 2026-09-23・後のマイルストーン）。
 *
 * 繋がる先: 資料は POST /api/blob-upload 経由で非公開の Blob へ上げ、POST /api/rescue で一式を生成する。
 * 保存は GET /api/clients（lib/clients/useClientList.ts で読む）で行き先を選び、新しい利用者なら
 * POST /api/clients、各帳票は POST /api/documents（source: "rescue"）。保存の順と押し直しは
 * lib/rescue/saveBundle.ts が受け持つ（途中で失敗したら、押し直しは同じ利用者へ残りの帳票だけ ── 2026-09-24 検収）。
 * 利用者一覧を読めるまで保存を止める（saveBlocked）── 読めないまま進むと行き先が「新しい利用者として保存」
 * だけになり、同じ方を黙って二重に登録してしまうため（2026-09-23 作り直し計画 U0 の検収）。
 * 入口: 利用者の区画（components/clients/ClientPane.tsx）の「一式まとめて」（/rescue?client={id}）。
 * 左のナビ（lib/nav.ts）に項目は無く、/rescue は「つくる」の中として光る（以前の左メニュー Sidebar.tsx は A案で外した）。
 */
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
  // 一時保管の削除に失敗したときの警告（サーバーの返事の warnings・成功でも失敗でも出す）
  const [tempWarnings, setTempWarnings] = useState<string[]>([]);
  const [intake, setIntake] = useState<IntakeResult | null>(null);
  /** 第6段: 資料ごとの種別（職員が選ぶ。読みどころが変わる）。キーは name+size */
  const [docTypes, setDocTypes] = useState<Record<string, IntakeDocType>>({});
  const fileKey = (f: File) => `${f.name}-${f.size}`;
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 結果が出たら、保存先の利用者候補を読み込む（結果が出るたびに読み直す）
  const clientList = useClientList(bundle !== null);
  /**
   * 一覧を読めるまで保存させない（2026-09-23 検収の指摘）。
   * 読めないまま進むと、選べる行き先が「新しい利用者として保存」だけになり、同じ方を黙って
   * 二重に登録してしまう（記録が2か所に分かれる。氏名の表記が少し違うと名簿の安全網が
   * 事業所全体の送信を止める）。読み込み中も同じ理由で止める。
   */
  const saveBlocked = clientList.status !== "ready";
  const [targetClientId, setTargetClientId] = useState("");
  const [newClientName, setNewClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  /**
   * 保存の途中経過（2026-09-24 検収の指摘）。途中の1枚で失敗したら、作った利用者と保存済みの帳票をここに残し、
   * 押し直しでは同じ利用者へ残りの帳票だけを保存する（もう1人作らない・二重に保存しない）。
   * 一式を作り直したら捨てる（前の一式の途中経過を、別の一式に当てない）。
   */
  const [saveProgress, setSaveProgress] = useState<BundleSaveProgress<DocKey> | null>(null);

  /** 一式が変わるときに、前の一式の保存の結果と途中経過を捨てる（別の一式を「保存しました」と見せない）。 */
  const resetSave = () => {
    setSavedClientId(null);
    setSaveProgress(null);
  };

  const setField = (key: keyof PersonaForm, value: string) =>
    setPersona((p) => ({ ...p, [key]: value }));

  // 参考資料の選択（クリック・ドロップ共通）。PDF・画像以外/10MB超/6件目以降は弾く
  const addFiles = (incoming: File[]) => {
    setError(null);
    const next = [...files];
    for (const f of incoming) {
      if (!ACCEPTED_TYPES.includes(f.type)) {
        setError("参考資料は PDF か画像（JPEG・PNG・WebP）のみ追加できます。");
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
    setTempWarnings([]);
    resetSave();
    try {
      // ── Step 1: 参考資料を Vercel Blob へアップロード（evaluate と同じ経路） ──
      let sourceDocs: SourceDoc[] | undefined;
      if (files.length > 0) {
        setLoadingMsg("資料を読み取り中…");
        try {
          const uploaded: SourceDoc[] = [];
          for (const f of files) {
            // 一時保管先の URL に元ファイル名（実名入りのことがある）を出さない: 拡張子だけの名前で上げる
            const blob = await upload(`intake/${Date.now()}.${safeExtension(f.name)}`, f, {
              access: "private", // 非公開ストア（D6・2026-09-12）。URL を知っていても認証なしでは読めない
              handleUploadUrl: "/api/blob-upload",
            });
            uploaded.push({
              name: f.name,
              url: blob.url,
              contentType: f.type,
              docType: docTypes[fileKey(f)] ?? "その他",
            });
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
      setTempWarnings(warningsOf(data));
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
    const all = BUNDLE_DOCS.map(
      ({ key, label }) => `==== ${label} ====\n${docToText(key, bundle)}`,
    ).join("\n\n\n");
    await navigator.clipboard.writeText(all);
    setCopiedKey("all");
    setTimeout(() => setCopiedKey(null), 1500);
  };

  // 生成した5帳票を、選択した（または新規の）利用者に保存する。途中で失敗したら、押し直しは
  // 同じ利用者へ残りの帳票だけを保存する（lib/rescue/saveBundle.ts・2026-09-24 検収の指摘）
  const saveBundle = async () => {
    if (!bundle || saveBlocked) return;
    setSaving(true);
    setError(null);
    try {
      const done = await saveBundleDocuments({
        bundle,
        keys: DOC_KEYS,
        targetClientId,
        targetClientCode: clientList.clients.find((c) => c.id === targetClientId)?.code ?? null,
        newClientName,
        progress: saveProgress,
        onProgress: setSaveProgress,
      });
      setSavedClientId(done.clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="legacy-page app-page">
      <PageHeader
        title="書類一式をつくる"
        description="利用者の人物像・診療情報などを入力すると、アセスメントからモニタリングまで5帳票の下書きを一括で作成します。"
        helpAnchor="ch6"
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
              <SectionTitle>参考資料（PDF・画像・任意）</SectionTitle>
              <p className="mt-1.5 text-xs text-[var(--faint)]">
                主治医意見書・診療情報提供書・看護サマリーなどを最大{MAX_SOURCE_DOCS}件（1件
                {MAX_SOURCE_DOC_MB}MB目安）。紙はスマホで撮った写真（JPEG・PNG）でも読み取れます。
                資料ごとに種別を選ぶと、AIがその書類の「読みどころ」を押さえて事実を抜き出し、資料どうしの食い違いも指摘します。
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
              aria-label="参考資料（PDF・画像）を選択、またはドラッグ＆ドロップ"
              className={`cursor-pointer rounded-[10px] border-2 border-dashed p-6 text-center transition-colors duration-300 ${
                dragOver
                  ? "border-[var(--green)] bg-[var(--green-soft)]"
                  : "border-[var(--line)] bg-[var(--card)] hover:border-[var(--green)]"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="mb-2 flex justify-center text-[var(--faint)]">
                <IconUpload size={26} />
              </div>
              <div className="text-sm font-semibold text-[var(--ink)]">
                PDF・写真をドラッグ＆ドロップ
              </div>
              <div className="mt-1 text-xs text-[var(--muted)]">
                またはクリックしてファイルを選択（複数可）
              </div>
            </div>

            {files.length > 0 && (
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="flex items-center gap-2.5 rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-3.5 py-2.5"
                  >
                    <IconFileText size={16} className="shrink-0 text-[var(--green)]" />
                    <span className="min-w-0 flex-1 truncate text-sm text-[var(--ink)]">
                      {f.name}
                    </span>
                    <select
                      value={docTypes[fileKey(f)] ?? "その他"}
                      onChange={(e) =>
                        setDocTypes((prev) => ({
                          ...prev,
                          [fileKey(f)]: e.target.value as IntakeDocType,
                        }))
                      }
                      aria-label={`${f.name} の種別`}
                      className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--card)] px-2 py-1 text-xs"
                    >
                      {INTAKE_DOC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <span className="shrink-0 tnum text-xs text-[var(--faint)]">
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

          {/* 一時保管の削除の警告: 入力の画面では、押したボタンとエラーのすぐ上に出す（ページの上だと画面の外になる） */}
          <TempDeleteWarnings warnings={tempWarnings} />
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
          {/* 作成が成功して削除だけ失敗したとき: 結果の先頭に出し、画面の中へ動かす（スクロールの位置は入力のときのまま残るため） */}
          <TempDeleteWarnings warnings={tempWarnings} scrollIntoView />
          {intake && (
            <Card className="space-y-3 p-6">
              <SectionTitle>提供書類の読み取り（AI統合）</SectionTitle>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">
                {intake.summary}
              </p>

              {/* 第6段: 資料ごとの読み取り報告（種別の食い違い・判読の状態） */}
              {(intake.documents?.length ?? 0) > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {intake.documents.map((d) => (
                    <li
                      key={d.name}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${
                        d.readability === "良好"
                          ? "border-[var(--green-line)] bg-[var(--green-soft)] text-[var(--green)]"
                          : "border-[var(--clay)] bg-[var(--clay-soft)] text-[var(--clay)]"
                      }`}
                    >
                      {d.name}：{d.detectedType}・{d.readability}
                    </li>
                  ))}
                </ul>
              )}

              {/* 資料どうしの食い違い（人が確かめる） */}
              {(intake.conflicts?.length ?? 0) > 0 && (
                <div className="border border-[var(--clay-line)] bg-[var(--clay-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--clay)]">
                    資料どうしの食い違い（<span className="tnum">{intake.conflicts.length}</span>
                    件・確かめてから使う）
                  </p>
                  <ul className="mt-1.5 space-y-2">
                    {intake.conflicts.map((c) => (
                      <li key={c.topic} className="text-xs leading-relaxed text-[var(--ink)]">
                        <span className="font-medium">{c.topic}</span>
                        <ul className="ml-3 mt-0.5 list-disc">
                          {c.statements.map((s) => (
                            <li key={`${s.source}-${s.text}`}>
                              {s.source}：{s.text}
                            </li>
                          ))}
                        </ul>
                        <span className="text-[var(--muted)]">確認方法：{c.advice}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 出典つきの事実（分類別） */}
              {(intake.facts?.length ?? 0) > 0 && (
                <details className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] px-4 py-3">
                  <summary className="cursor-pointer text-xs font-semibold text-[var(--ink)]">
                    読み取った事実（<span className="tnum">{intake.facts.length}</span>
                    件・出典つき）
                  </summary>
                  <div className="mt-2 space-y-2">
                    {INTAKE_CATEGORIES.filter((cat) =>
                      intake.facts.some((f) => f.category === cat),
                    ).map((cat) => (
                      <div key={cat}>
                        <p className="text-xs font-medium text-[var(--green)]">【{cat}】</p>
                        <ul className="ml-3 list-disc">
                          {intake.facts
                            .filter((f) => f.category === cat)
                            .map((f) => (
                              <li
                                key={`${f.source}-${f.text}`}
                                className="text-xs leading-relaxed text-[var(--ink)]"
                              >
                                {f.date ? `[${f.date}] ` : ""}
                                {f.text}
                                <span className="text-[var(--faint)]">（出典: {f.source}）</span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {intake.cautions.length > 0 && (
                <div className="border border-[var(--amber-line)] bg-[var(--amber-soft)] px-4 py-3">
                  <p className="text-xs font-semibold text-[var(--amber)]">要注意点</p>
                  <ul className="mt-1.5 space-y-1">
                    {intake.cautions.map((c) => (
                      <li
                        key={c}
                        className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--amber)]"
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
            <div className="rounded-[10px] border border-[var(--green-line)] bg-[var(--green-soft)] p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-[var(--green)]">
                <IconCheck size={16} />
                利用者に保存しました
              </p>
              <Link
                href={`/clients/${savedClientId}`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--green)] underline underline-offset-4 transition-colors hover:text-[var(--green-deep)]"
              >
                利用者ページで見る
                <IconArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="space-y-4 rounded-[10px] border border-[var(--green-line)] bg-[var(--green-soft)] p-5">
              <SectionTitle>利用者に保存</SectionTitle>
              {saveProgress ? (
                // 途中まで保存した後は、保存先を選び直させない（一式を2人に分けない・もう1人作らない）
                <p className="text-sm leading-relaxed text-[var(--ink)]">
                  保存先は
                  {saveProgress.clientCode ? (
                    <span className="code-chip mx-1">{saveProgress.clientCode}様</span>
                  ) : saveProgress.createdClient ? (
                    "この保存で新しく登録した利用者"
                  ) : (
                    "選んだ利用者"
                  )}
                  {saveProgress.clientCode && saveProgress.createdClient
                    ? "（この保存で新しく登録）"
                    : ""}
                  に決まっています。保存済みは
                  <span className="tnum mx-1">{saveProgress.savedKeys.length}</span>
                  帳票です。もう一度押すと、残りの
                  <span className="tnum mx-1">
                    {DOC_KEYS.length - saveProgress.savedKeys.length}
                  </span>
                  帳票を同じ利用者に保存します。
                </p>
              ) : (
                <>
                  <Field label="保存先の利用者" htmlFor="save-client">
                    <select
                      id="save-client"
                      value={targetClientId}
                      onChange={(e) => setTargetClientId(e.target.value)}
                      disabled={saveBlocked}
                      className={inputClass}
                    >
                      <option value="">新しい利用者として保存</option>
                      {clientList.clients.map((c) => (
                        <option key={c.id} value={c.id} className="code-chip">
                          {c.code}様
                        </option>
                      ))}
                    </select>
                  </Field>
                  {clientList.status === "loading" && (
                    <p className="flex items-center gap-2 text-xs text-[var(--muted)]">
                      <IconLoader size={14} className="animate-spin" />
                      利用者一覧を読み込み中…
                    </p>
                  )}
                  {clientList.status === "error" && (
                    <div role="alert" className="space-y-3">
                      <ErrorNotice
                        message={`${clientList.message} 同じ方を二重に登録しないよう、一覧を読めるまで「新しい利用者として保存」を止めています。`}
                      />
                      <button type="button" onClick={clientList.reload} className={btnSecondary}>
                        一覧をもう一度読む
                      </button>
                    </div>
                  )}
                  {!targetClientId && !saveBlocked && (
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
                </>
              )}
              {error && <ErrorNotice message={error} />}
              <button
                type="button"
                onClick={saveBundle}
                disabled={saving || saveBlocked}
                className={btnPrimary}
              >
                {saving ? (
                  <>
                    <IconLoader size={16} className="animate-spin" />
                    保存中…
                  </>
                ) : saveProgress ? (
                  `残りの${DOC_KEYS.length - saveProgress.savedKeys.length}帳票を保存`
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
                setTempWarnings([]);
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

          {BUNDLE_DOCS.map(({ key, label }) => (
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
