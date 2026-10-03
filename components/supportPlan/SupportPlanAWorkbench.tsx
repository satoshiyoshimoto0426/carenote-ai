"use client";

/**
 * 就労A型の個別支援計画書（原案）を作る単独の画面（段階2・docs/TASK-LEDGER.md T-SPA-01）。
 *
 * 流れ: ①基本情報（名簿の代わり）→ ②本人への説明と同意 → ③面談（録音または文字起こしの貼り付け。
 *   話題ごとの「話に出たか」の目安を横に出す）→「面談を終える」→ ④送る前の確認（/api/preview・PreSendPreview）
 *   → ⑤ /api/generate（documentType "supportPlanA"）→ ⑥様式どおりの表示（Paged.js・sandbox の iframe）→ 印刷・PDF。
 *
 * なぜこの作りか:
 *   - 決定①「面談を終えてから1回で作る」: AI へ送るのは「面談を終える」の後の1回だけ。目安の判定は端末の中だけで行う。
 *   - 決定②「単独で出す」: CareNote の外枠（Rail・TopBar）と名簿を使わない。基本情報は画面で受け取り、
 *     氏名・受給者証番号は受け取らない（様式の ID化の原則 ── lib/supportPlan/standalone.ts）。
 *   - 何も保存しない: 文字起こし・原案はこの画面の中（メモリ）だけにある。閉じる・再読み込みで消えるので、
 *     入力があるうちは離れる前にブラウザが確かめる（beforeunload）。残すときは印刷・PDF に保存する。
 *   - 黒塗りと「送る前に見る」は CareNote と同じ経路（/api/preview と /api/generate が同じ maskRequestBody を通る）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import ItemsToConfirm from "@/components/drafts/ItemsToConfirm";
import PreSendPreview, { type PreviewData } from "@/components/drafts/PreSendPreview";
import RecordingPanel, { RECORDING_ENABLED } from "@/components/recording/RecordingPanel";
import {
  btnPrimary,
  btnSecondary,
  Field,
  inputClass,
  textareaClass,
} from "@/components/ui/primitives";
import { topicCoverage } from "@/lib/supportPlan/coverage";
import { buildSupportPlanAView } from "@/lib/supportPlan/format";
import {
  BASIC_FIELDS,
  clientInfoOf,
  emptyForm,
  formProblems,
  metaOf,
  rosterOf,
  type SupportPlanAForm,
} from "@/lib/supportPlan/standalone";
import type { SupportPlanADraft } from "@/types/supportPlanA";
import { buildSupportPlanPrintHtml, PRINT_MESSAGE } from "./printHtml";

type Step = "interview" | "preview" | "result";

export default function SupportPlanAWorkbench() {
  const [form, setForm] = useState<SupportPlanAForm>(() => emptyForm(new Date()));
  const [consent, setConsent] = useState(false);
  const [notes, setNotes] = useState("");
  const [recorded, setRecorded] = useState(false);
  const [step, setStep] = useState<Step>("interview");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [draft, setDraft] = useState<SupportPlanADraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const coverage = useMemo(() => topicCoverage(notes), [notes]);
  const heardCount = coverage.filter((c) => c.heard).length;
  const problems = formProblems(form);

  // 何も保存しないので、入力があるうちは離れる前に確かめる
  const dirty = notes.trim() !== "" || draft !== null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const printHtml = useMemo(() => {
    if (!draft) return "";
    const view = buildSupportPlanAView(draft, metaOf(form, recorded), rosterOf(form));
    return buildSupportPlanPrintHtml(view, `個別支援計画書（${form.clientCode.trim()}）`);
  }, [draft, form, recorded]);

  const setBasic = (key: keyof SupportPlanAForm["basic"], value: string) =>
    setForm((f) => ({ ...f, basic: { ...f.basic, [key]: value } }));

  const payload = () => ({
    documentType: "supportPlanA",
    clientInfo: clientInfoOf(form),
    interviewNotes: notes,
  });

  /** 「面談を終える」: AI へ送る前の文章（黒塗り後）を取り寄せて見せる。AI はまだ呼ばない */
  const finishInterview = async () => {
    if (problems.length > 0) {
      setError(problems[0]);
      return;
    }
    if (!consent) {
      setError("本人への説明と同意のチェックを入れてください。");
      return;
    }
    if (!notes.trim()) {
      setError("面談の文字起こし・メモがありません。録音するか、文字起こしを貼り付けてください。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setPreview(data as PreviewData);
      setStep("preview");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  /** 確認のあと AI へ送り、原案を作る（約30秒〜1分） */
  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setDraft(data as SupportPlanADraft);
      setPreview(null);
      setStep("result");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "不明なエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const print = () => frameRef.current?.contentWindow?.postMessage(PRINT_MESSAGE, "*");

  const startOver = () => {
    if (!window.confirm("文字起こしと原案を消して、最初からやり直します。よろしいですか？")) return;
    setForm(emptyForm(new Date()));
    setConsent(false);
    setNotes("");
    setRecorded(false);
    setDraft(null);
    setPreview(null);
    setError(null);
    setStep("interview");
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 md:px-8">
      <header className="mb-6 border-b border-[var(--line)] pb-4">
        <p className="text-[12.5px] text-[var(--muted)]">就労継続支援A型 ／ 試行版</p>
        <h1 className="text-[22px] font-bold text-[var(--ink)]">個別支援計画書（原案）をつくる</h1>
        <p className="mt-1 text-[13px] leading-[1.8] text-[var(--muted)]">
          面談を録音（または文字起こしを貼り付け）して「面談を終える」を押すと、事業所の様式どおりの原案ができます。
          原案はサービス管理責任者が確かめて仕上げてください。この画面は何も保存しません。残すときは「印刷・PDF」で保存してください。
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="mb-4 border border-[var(--clay-line)] bg-[var(--clay-soft)] px-4 py-3 text-[13.5px] text-[var(--ink)]"
        >
          {error}
        </div>
      ) : null}

      {step === "interview" ? (
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="space-y-8">
            <section aria-labelledby="sp-basic">
              <h2 id="sp-basic" className="mb-3 text-[16px] font-bold text-[var(--ink)]">
                ① 基本情報
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="利用者コード（必須）"
                  htmlFor="sp-code"
                  hint="氏名は書きません（様式の ID化の原則）。例「K-014」"
                >
                  <input
                    id="sp-code"
                    className={inputClass}
                    value={form.clientCode}
                    onChange={(e) => setForm((f) => ({ ...f, clientCode: e.target.value }))}
                    autoComplete="off"
                  />
                </Field>
                <Field
                  label="計画番号（任意）"
                  htmlFor="sp-planno"
                  hint="空なら手書きの欄になります"
                >
                  <input
                    id="sp-planno"
                    className={inputClass}
                    value={form.planNumber}
                    onChange={(e) => setForm((f) => ({ ...f, planNumber: e.target.value }))}
                  />
                </Field>
                <Field label="計画期間の始まり" htmlFor="sp-start">
                  <input
                    id="sp-start"
                    type="date"
                    className={inputClass}
                    value={form.periodStart}
                    onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))}
                  />
                </Field>
                <Field
                  label="計画期間の終わり"
                  htmlFor="sp-end"
                  hint="評価の時期・次回の見直しの月になります"
                >
                  <input
                    id="sp-end"
                    type="date"
                    className={inputClass}
                    value={form.periodEnd}
                    onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))}
                  />
                </Field>
                <Field label="作成日" htmlFor="sp-created">
                  <input
                    id="sp-created"
                    type="date"
                    className={inputClass}
                    value={form.createdAt}
                    onChange={(e) => setForm((f) => ({ ...f, createdAt: e.target.value }))}
                  />
                </Field>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-[13.5px] text-[var(--ink)]">
                    <input
                      type="checkbox"
                      checked={form.familyPresent}
                      onChange={(e) => setForm((f) => ({ ...f, familyPresent: e.target.checked }))}
                    />
                    家族が面談に同席した
                  </label>
                </div>
              </div>
              <details className="mt-4">
                <summary className="cursor-pointer text-[13.5px] font-bold text-[var(--ink)]">
                  分かっている基本情報を入れる（任意・入れた欄は面談の話より優先されます）
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  {BASIC_FIELDS.map(({ key, label, example }) => (
                    <Field key={key} label={label} htmlFor={`sp-${key}`} hint={`例「${example}」`}>
                      <input
                        id={`sp-${key}`}
                        className={inputClass}
                        value={form.basic[key] ?? ""}
                        onChange={(e) => setBasic(key, e.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </details>
            </section>

            <section aria-labelledby="sp-consent">
              <h2 id="sp-consent" className="mb-3 text-[16px] font-bold text-[var(--ink)]">
                ② 本人への説明と同意
              </h2>
              <label className="flex items-start gap-2 text-[13.5px] leading-[1.8] text-[var(--ink)]">
                <input
                  type="checkbox"
                  className="mt-1.5"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                本人（同席の家族を含む）に、面談を録音して文字にすること・計画書の原案づくりに AI
                を使うこと・ 原案はサービス管理責任者が確かめて仕上げることを説明し、同意を得た。
              </label>
            </section>

            <section aria-labelledby="sp-interview">
              <h2 id="sp-interview" className="mb-3 text-[16px] font-bold text-[var(--ink)]">
                ③ 面談
              </h2>
              {RECORDING_ENABLED ? (
                <div className="mb-4">
                  <RecordingPanel
                    disabled={!consent || loading}
                    onTranscript={(text) => {
                      setRecorded(true);
                      setNotes((n) => (n.trim() ? `${n.trimEnd()}\n${text}` : text));
                    }}
                  />
                  {!consent ? (
                    <p className="mt-1 text-[12.5px] text-[var(--muted)]">
                      ②の同意にチェックを入れると録音できます。
                    </p>
                  ) : null}
                </div>
              ) : null}
              <Field
                label="面談の文字起こし・メモ"
                htmlFor="sp-notes"
                hint="録音した分はここに足されます。ほかで起こした文字起こしを貼り付けても使えます。直してから送れます。"
              >
                <textarea
                  id="sp-notes"
                  className={`${textareaClass} min-h-[320px]`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </Field>
            </section>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={btnPrimary}
                onClick={finishInterview}
                disabled={loading}
              >
                {loading ? "確認の文章を準備中…" : "面談を終える（送る前の確認へ）"}
              </button>
              <span className="text-[12.5px] text-[var(--muted)]">
                AI へはまだ送りません。次の画面で、送る文章を確かめます。
              </span>
            </div>
          </div>

          <aside aria-labelledby="sp-guide" className="md:sticky md:top-4 md:self-start">
            <h2 id="sp-guide" className="mb-1 text-[14.5px] font-bold text-[var(--ink)]">
              面談の進め方（話に出たかの目安 {heardCount}/{coverage.length}）
            </h2>
            <p className="mb-3 text-[12px] leading-[1.7] text-[var(--muted)]">
              言葉が出たかを、この端末の中だけで見ています。十分に聞けたかは判定しません。
            </p>
            <ol className="space-y-3">
              {coverage.map(({ topic, heard }) => (
                <li key={topic.id} className="text-[13px] leading-[1.7]">
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={heard ? "text-[var(--green)]" : "text-[var(--faint)]"}
                    >
                      {heard ? "●" : "○"}
                    </span>
                    <span>
                      <span className="font-bold text-[var(--ink)]">{topic.label}</span>
                      <span className="text-[var(--muted)]">（{topic.chapter}）</span>
                      <span className="sr-only">{heard ? "話に出た" : "まだ話に出ていない"}</span>
                      {heard ? null : (
                        <span className="block text-[12.5px] text-[var(--muted)]">
                          例：{topic.ask}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <section aria-label="送る前の確認">
          <PreSendPreview
            data={preview}
            loading={loading}
            onBack={() => {
              setPreview(null);
              setStep("interview");
            }}
            onConfirm={generate}
            primaryClass={btnPrimary}
            secondaryClass={btnSecondary}
          />
          {loading ? (
            <p role="status" className="mt-4 text-[13.5px] text-[var(--muted)]">
              原案を作っています（30秒〜1分ほど）。画面を閉じずにお待ちください。
            </p>
          ) : null}
        </section>
      ) : null}

      {step === "result" && draft ? (
        <section aria-labelledby="sp-result">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 id="sp-result" className="mr-auto text-[16px] font-bold text-[var(--ink)]">
              ⑥ 原案（様式どおり）
            </h2>
            <button type="button" className={btnPrimary} onClick={print}>
              印刷・PDFに保存
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                setStep("interview");
              }}
            >
              面談の文字起こしに戻る
            </button>
            <button type="button" className={btnSecondary} onClick={startOver}>
              最初からやり直す
            </button>
          </div>
          <p className="mb-3 text-[12.5px] leading-[1.7] text-[var(--muted)]">
            PDF にするときは、印刷の画面で送り先を「PDF に保存」にしてください。
            「（要記入）」は面談で話に出なかった欄です。サービス管理責任者が記入・確認してください。
          </p>
          <ItemsToConfirm items={draft.itemsToConfirm} />
          <iframe
            ref={frameRef}
            title="個別支援計画書（原案）"
            sandbox="allow-scripts allow-modals"
            srcDoc={printHtml}
            className="mt-4 h-[80vh] w-full border border-[var(--line)] bg-white"
          />
        </section>
      ) : null}
    </div>
  );
}
