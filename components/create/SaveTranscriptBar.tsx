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
 *   保存先の候補 = GET /api/clients（lib/clients/useClientList.ts 経由。読めなければ
 *   「利用者一覧を読めませんでした」を出す ── 以前は黙って選択肢が空になっていた・2026-09-23）
 */
import { useEffect, useState } from "react";
import { useClientList } from "@/lib/clients/useClientList";
import { TITLE_MAX_CHARS, type TranscriptKind } from "@/lib/privacy/transcriptInput";

interface Props {
  /** 保存する本文（メモ欄の中身） */
  text: string;
  kind: TranscriptKind;
  inputClass: string;
  secondaryClass: string;
}

/**
 * 「この欄の内容を記録として残す（任意）」の欄（保存先の利用者・見出し・残すボタン）。text が空なら何も描かない。
 * 呼ぶ側: components/create/NotesField.tsx（/create の録音の入口がある欄の下）。
 */
export default function SaveTranscriptBar({ text, kind, inputClass, secondaryClass }: Props) {
  const clientList = useClientList();
  const [clientId, setClientId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // A案（R1・2026-09-24）: 角を丸めた箱をやめ、上に 1px の線を引いた区切りにした。文字と並びは以前のまま
    <div className="mt-4 border-t border-[var(--line-inner)] pt-3.5">
      <p className="section-label">この欄の内容を記録として残す（任意）</p>
      <p className="mt-1.5 text-xs leading-[1.8] text-[var(--muted)]">
        あとで「言った・言わない」を確かめたいときに残します。いま上の欄に書かれている全文
        （録音から起こした文章も、手で書き足した部分も）を、実名が入ったまま暗号化して保存します。
        保存から5年を過ぎたら消す決まりですが、いまは自動で消えません（管理者がまとめて消します）。
        残さない場合は、画面を離れた時点で消えます。
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={`${inputClass} max-w-full`}
          aria-label="保存先の利用者"
        >
          <option value="">保存先の利用者を選ぶ</option>
          {clientList.clients.map((c) => (
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
          className={`${inputClass} w-72 max-w-full`}
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
      {clientList.status === "error" && (
        <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium text-[var(--clay)]">
            {clientList.message} 保存先の利用者を選べないため、いまは記録として残せません。
          </p>
          <button type="button" onClick={clientList.reload} className={secondaryClass}>
            一覧をもう一度読む
          </button>
        </div>
      )}
      <p className="mt-1.5 text-xs text-[var(--faint)]">
        見出しには実名を書かないでください（一覧にそのまま出ます）。
      </p>
      {error && <p className="mt-1.5 text-xs font-medium text-[var(--clay)]">{error}</p>}
    </div>
  );
}
