"use client";

/**
 * 文字起こしを利用者の記録として残す（docs/specs/recording-pipeline.md R4）。
 *
 * なぜ「押したときだけ」保存するか:
 *   保存する本文には**黒塗りが効かない生の実名**が入る。自動で貯めると、職員が意図しないものまで
 *   5年ぶん残っていく。残すかどうかは毎回その場で決めてもらう（決定 D-R3 の運用）。
 *
 * なぜ利用者を選ばせるか:
 *   誰のものか分からない記録は、あとで探せず、開示・削除の請求にも応じられない。
 *   保存先の利用者を決めることで、見える範囲（事業所）も保存期限も自動的に決まる。
 *
 * 何と繋がるか:
 *   保存先 = /api/transcripts（暗号化して client_transcripts へ）
 *   読み返し = components/clients/SavedTranscripts.tsx（利用者の画面）
 */
import { useEffect, useState } from "react";
import { TITLE_MAX_CHARS, type TranscriptKind } from "@/lib/privacy/transcriptInput";
import type { ClientRecord } from "@/types/client";

interface Props {
  /** 保存する本文（メモ欄の中身） */
  text: string;
  kind: TranscriptKind;
  inputClass: string;
  secondaryClass: string;
}

export default function SaveTranscriptBar({ text, kind, inputClass, secondaryClass }: Props) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/clients");
        if (!res.ok) return;
        const list = (await res.json()) as ClientRecord[];
        if (alive) setClients(list);
      } catch {
        // 一覧が取れなければ保存先を選べないだけ。画面は壊さない
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 本文が変わったら「保存しました」を取り下げる（別の内容を保存済みに見せない）
  // biome-ignore lint/correctness/useExhaustiveDependencies: 理由: 本文の変化そのものが合図なので text を依存に入れる
  useEffect(() => {
    setDone(false);
  }, [text]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, kind, title, text }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "保存できませんでした");
      setDone(true);
      setTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  if (text.trim().length === 0) return null;

  return (
    <div className="mt-2 rounded-[8px] border border-[var(--line)] bg-[var(--surface)] p-2.5">
      <p className="text-xs font-medium text-[var(--ink)]">この欄の内容を記録として残す（任意）</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        あとで「言った・言わない」を確かめたいときに残します。いま上の欄に書かれている全文
        （録音から起こした文章も、手で書き足した部分も）を、実名が入ったまま暗号化して保存します。
        5年で消えます。残さない場合は、画面を離れた時点で消えます。
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`${inputClass} h-9 w-auto py-0`}
          aria-label="保存先の利用者"
        >
          <option value="">保存先の利用者を選ぶ</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code}様
            </option>
          ))}
        </select>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX_CHARS}
          placeholder="見出し（例: 9月17日 担当者会議）"
          className={`${inputClass} h-9 w-56 py-0`}
          aria-label="見出し"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy || !clientId}
          className={secondaryClass}
        >
          {busy ? "保存しています…" : "記録として残す"}
        </button>
        {done && <span className="text-xs font-medium text-[var(--green)]">保存しました</span>}
      </div>
      <p className="mt-1.5 text-xs text-[var(--faint)]">
        見出しには実名を書かないでください（一覧にそのまま出ます）。
      </p>
      {error && <p className="mt-1.5 text-xs font-medium text-[var(--clay)]">{error}</p>}
    </div>
  );
}
