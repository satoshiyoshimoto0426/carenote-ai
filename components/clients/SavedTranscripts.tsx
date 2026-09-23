"use client";

/**
 * 保存した文字起こしの一覧（docs/specs/recording-pipeline.md R4）。
 *
 * なぜ画面に出すか:
 *   吉本さん決定 D-R3「会議の文字起こし全文を残す」の目的は、あとから
 *   「言った・言わない」を確かめられることにある。保存しても読み返せなければ意味がない。
 *
 * ⚠ ここに出る本文は**黒塗りを通っていない実名そのもの**。画面を人に見せないこと。
 *   一覧では本文を取りに行かず、「開く」を押したときだけサーバで復号して取り寄せる。
 *
 * 一覧を読めなかったとき（GET /api/transcripts が 503 など）は、欄ごと消さずに読めなかったことを文字で出す
 * （2026-09-24 検収の指摘 ── 以前は黙って欄が消え、「保存した文字起こしは無い」と見えていた）。
 * 消せなかったときは、サーバの文（「消せませんでした（消えていません）。」など）をそのまま出す。
 */
import { useCallback, useEffect, useState } from "react";
import type { TranscriptSummary } from "@/lib/db/transcripts";
import { kindLabel } from "@/lib/privacy/transcriptInput";

interface Props {
  clientId: string;
  clientCode: string;
  secondaryClass: string;
}

const day = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

export default function SavedTranscripts({ clientId, clientCode, secondaryClass }: Props) {
  const [items, setItems] = useState<TranscriptSummary[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 一覧を読めなかったときの文（読めたら null）。0件と取り違えないよう別に持つ */
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/transcripts?clientId=${encodeURIComponent(clientId)}`);
      const data = (await res.json().catch(() => ({}))) as {
        transcripts?: TranscriptSummary[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.transcripts)) {
        setLoadError(data.error || "保存した文字起こしの一覧を読み込めませんでした。");
        return;
      }
      setLoadError(null);
      setItems(data.transcripts);
    } catch {
      setLoadError(
        "保存した文字起こしの一覧を読み込めませんでした。通信環境を確かめて、もう一度お試しください。",
      );
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/transcripts/${id}`);
      const data = (await res.json()) as { text?: string; error?: string };
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
      const res = await fetch(`/api/transcripts/${id}`, { method: "DELETE" });
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

  // 0件なら欄を出さない。読めなかったときは出す（0件と取り違えさせない）
  if (items.length === 0 && !loadError) return null;

  return (
    <section className="rounded-[10px] border border-[var(--line)] bg-[var(--card)] p-4">
      <h3 className="text-xs font-medium text-[var(--muted)]">
        保存した文字起こし（{clientCode}様）
      </h3>
      <p className="mt-1 text-xs text-[var(--faint)]">
        録音から起こしたそのままの文章です。実名が入っているので、画面を人に見せないでください。
        保存から5年を過ぎたら消す決まりですが、いまは自動で消えません（管理者がまとめて消します）。
        すぐ消したいものは、その行の「消す」を押してください。
      </p>

      {loadError && (
        <div role="alert" className="mt-2.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-[var(--clay)]">{loadError}</p>
          <button
            type="button"
            onClick={() => void load()}
            className={`${secondaryClass} h-7 px-2.5 text-xs`}
          >
            もう一度読む
          </button>
        </div>
      )}

      <ul className="mt-2.5 space-y-2">
        {items.map((t) => (
          <li
            key={t.id}
            className="rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-2.5"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium text-[var(--ink)]">{kindLabel(t.kind)}</span>
              <span className="tnum text-[var(--muted)]">{day(t.createdAt)}</span>
              <span className="tnum text-[var(--faint)]">{t.chars}字</span>
              {t.title && <span className="text-[var(--muted)]">{t.title}</span>}
              <span className="ml-auto flex gap-1.5">
                <button
                  type="button"
                  onClick={() => (openId === t.id ? setOpenId(null) : open(t.id))}
                  disabled={busy}
                  className={`${secondaryClass} h-7 px-2.5 text-xs`}
                >
                  {openId === t.id ? "閉じる" : "開く"}
                </button>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  disabled={busy}
                  className="h-7 rounded-[8px] border border-[var(--clay)] px-2.5 text-xs font-medium text-[var(--clay)] transition-colors hover:bg-[var(--clay)] hover:text-white"
                >
                  消す
                </button>
              </span>
            </div>
            {openId === t.id && (
              <p className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-[6px] bg-[var(--card)] p-2.5 text-sm leading-relaxed">
                {text}
              </p>
            )}
          </li>
        ))}
      </ul>

      {error && <p className="mt-2 text-xs font-medium text-[var(--clay)]">{error}</p>}
    </section>
  );
}
