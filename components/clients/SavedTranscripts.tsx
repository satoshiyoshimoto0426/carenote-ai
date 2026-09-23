"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { IconAlert } from "@/components/ui/icons";
import { SectionLabel } from "@/components/ui/primitives";
import type { TranscriptSummary } from "@/lib/db/transcripts";
import { kindLabel } from "@/lib/privacy/transcriptInput";

/** 通信そのものが失敗したとき（サーバーの文が無いとき）の文。 */
const NETWORK_ERROR =
  "残した文字起こしの一覧を読み込めませんでした。通信環境を確かめて、もう一度お試しください。";

/** 保存した日（「2026年9月17日」）。 */
const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

/**
 * 残した文字起こしの一覧（docs/specs/recording-pipeline.md R4）。利用者の区画（components/clients/ClientPane.tsx）の一番下に置く。
 *
 * なぜ画面に出すか:
 *   吉本さん決定 D-R3「会議の文字起こし全文を残す」の目的は、あとから
 *   「言った・言わない」を確かめられることにある。保存しても読み返せなければ意味がない。
 *
 * ⚠ ここに出る本文は**黒塗りを通っていない実名そのもの**。画面を人に見せないこと。
 *   一覧では本文を取りに行かず（GET /api/transcripts は本文を返さない）、「読む」を押したときだけ
 *   サーバで復号して取り寄せる（GET /api/transcripts/{id} ── app/api/transcripts/[id]/route.ts）。
 *
 * 見た目（A案「作業台」A6 ＝ 計画 U4・アートボード A-clients）: 見出し「残した文字起こし」、日付と種類 | 字数（等幅）| 読む | 消す の
 * 細い線で区切った行。以前の「開く」はアートボードどおり「読む」にした。残した物: 実名が入っている注意と、
 * **5年の決まりの正直な文「いまは自動で消えません」**（2026-09-18「画面だけが嘘をついていた」の直し）・「消す」の確かめ。
 *
 * 一覧を読めなかったとき（表が未作成の 503 ＝ TRANSCRIPT_TABLE_MISSING_MESSAGE など）は、欄を消さずにサーバーの文を
 * role="alert" で出し、「もう一度読む」を置く（以前は欄ごと消え、「残した文字起こしは無い」に見えた ── redesign-maps の risks。
 * 枝 redesign/a-backend の 41adc43 も同じ直しを以前の見た目のまま入れている）。0件で読めたときは、今までどおり欄を出さない。
 * 「消す」が失敗したら、サーバーの文（「消せませんでした（消えていません）…」など）をそのまま出す。
 *
 * @param clientId 利用者の id（GET /api/transcripts?clientId=…）。
 * テスト: components/clients/SavedTranscripts.live.test.tsx。
 */
export default function SavedTranscripts({ clientId }: { clientId: string }) {
  const [items, setItems] = useState<TranscriptSummary[]>([]);
  /** 一覧を読めなかったときの文（読めたら null）。0件と取り違えないよう別に持つ */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const headingId = `${uid}-heading`;

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch(`/api/transcripts?clientId=${encodeURIComponent(clientId)}`);
    } catch {
      setLoadError(NETWORK_ERROR);
      return;
    }
    const data = (await res.json().catch(() => ({}))) as {
      transcripts?: TranscriptSummary[];
      error?: string;
    };
    if (!res.ok || !Array.isArray(data.transcripts)) {
      setLoadError(data.error || "残した文字起こしの一覧を読み込めませんでした。");
      return;
    }
    setLoadError(null);
    setItems(data.transcripts);
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 「読む」を押したときだけ本文を取り寄せる（一覧では本文を持たない）
  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`);
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "読めませんでした");
      setText(data.text ?? "");
      setOpenId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読めませんでした");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("この文字起こしを消します。元に戻せません。よろしいですか。")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transcripts/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "消せませんでした");
      }
      if (openId === id) {
        setOpenId(null);
        setText("");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "消せませんでした");
    } finally {
      setBusy(false);
    }
  };

  // 0件なら欄を出さない（読み込み中も）。読めなかったときは出す（0件と取り違えさせない）
  if (items.length === 0 && !loadError) return null;

  return (
    <section aria-labelledby={headingId}>
      <SectionLabel id={headingId}>残した文字起こし</SectionLabel>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        録音から起こしたそのままの文章です。実名が入っているので、画面を人に見せないでください。
        保存から5年を過ぎたら消す決まりですが、いまは自動で消えません（管理者がまとめて消します）。
        すぐ消したいものは、その行の「消す」を押してください。
      </p>

      {loadError ? (
        <div role="alert" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex items-start gap-1.5 text-xs font-medium leading-relaxed text-[var(--clay)]">
            <IconAlert size={14} className="mt-0.5 shrink-0" />
            {loadError}
          </p>
          <button type="button" onClick={() => void load()} className="text-action">
            もう一度読む
          </button>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-1.5">
          {items.map((t) => {
            const labelId = `${uid}-${t.id}`;
            const textId = `${uid}-${t.id}-text`;
            const isOpen = openId === t.id;
            return (
              <li key={t.id} className="border-b border-[var(--line-faint)]">
                <div className="client-pane-row min-h-11 border-b-0">
                  <span id={labelId} className="min-w-0 flex-1">
                    {day(t.createdAt)} {kindLabel(t.kind)}
                    {t.title ? (
                      <span className="ml-2 text-[12.5px] text-[var(--muted)]">{t.title}</span>
                    ) : null}
                  </span>
                  <span className="client-pane-date text-[12px] text-[var(--muted)]">
                    {t.chars.toLocaleString("ja-JP")}字
                  </span>
                  <button
                    type="button"
                    onClick={() => (isOpen ? setOpenId(null) : void open(t.id))}
                    disabled={busy}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? textId : undefined}
                    aria-describedby={labelId}
                    className="text-action client-pane-action"
                  >
                    {isOpen ? "閉じる" : "読む"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(t.id)}
                    disabled={busy}
                    aria-describedby={labelId}
                    className="text-action client-pane-action text-[var(--clay)] hover:text-[var(--clay)]"
                  >
                    消す
                  </button>
                </div>
                {isOpen ? (
                  <p
                    id={textId}
                    className="mb-3 max-h-80 overflow-y-auto whitespace-pre-wrap border-l-2 border-[var(--line)] bg-[var(--card)] px-3 py-2.5 text-sm leading-relaxed text-[var(--ink)]"
                  >
                    {text}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--clay)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
