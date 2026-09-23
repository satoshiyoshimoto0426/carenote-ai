"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { IconAlert, IconLock } from "@/components/ui/icons";
import { btnSecondary, inputClass, SectionLabel } from "@/components/ui/primitives";
import type { RelatedPerson } from "@/lib/db/clients";
import { relatedAliasCode } from "@/lib/privacy/pseudonymize";

/** 続柄の入力の候補（datalist）。撮影の道具 tools/shoot-plans.mjs は input[list="relation-hints"] で欄を探す。 */
const RELATION_HINTS = [
  "長女",
  "長男",
  "妻",
  "夫",
  "担当ケアマネ",
  "主治医",
  "訪問看護師",
  "施設の担当者",
];

/** 通信そのものが失敗したとき（サーバーの文が無いとき）の文。 */
const NETWORK_ERROR =
  "関係者名簿を読み込めませんでした。通信環境を確かめて、もう一度お試しください。";

/**
 * 関係者名簿（D4）: 利用者ごとに家族・担当者・主治医などを登録する。利用者の区画（components/clients/ClientPane.tsx）の中に置く。
 *
 * なぜ存在するか: 名簿に無い人の名前は黒塗りで消えない（第1段の限界）。ここに登録した名前は、AIへ送る前に
 * 「B様の長女」のような記号に置き換わる（lib/db/clients.ts の loadAliases が関係者を含め、lib/privacy/maskPii.ts が置き換える）。
 * 名簿の実名そのものは AI へ渡さない（GET /api/clients/{id}/related は画面に出すためだけに返す）。
 *
 * 見た目（A案「作業台」A6 ＝ 計画 U4・アートボード A-clients）: 続柄 | 実名 | → 記号 の細い線で区切った行。カードは使わない。
 * 以前からの物は残す: 登録の欄（続柄の候補 datalist・「氏名（例: 佐藤 一郎）」の例・両方入れるまで押せない「登録」）・
 * 行ごとの「削除」（確かめの画面は出ない ── 使い方の本文 lib/manual/content.ts:338 がそう説明している）・サーバーの誤りの文。
 * 「登録」は脇のボタンの見た目（緑の主ボタンは区画の頭の「つくる」1つ）。
 *
 * 一覧を読めなかったとき（GET が 503 など）は、空の名簿に見せずに読めなかったことを role="alert" で出し、
 * 「もう一度読む」を置く（以前は黙って空になり、「家族はまだ登録されていない」と見えた ── redesign-maps の risks。
 * 枝 redesign/a-backend の 41adc43 も同じ直しを以前の見た目のまま入れている。文と「もう一度読む」はそれに合わせた）。
 *
 * 説明の文は計画の指摘（CRITIQUE・U4）どおり、保証できることだけを書く:
 * 「実名はこの画面にだけ表示します」（アートボード）は、「実名で表示」や残した文字起こしにも実名が出るので書かない。
 * 文言は吉本さんの確認待ち（docs/REDESIGN-A-SIGNOFF.md）。
 *
 * @param clientId 利用者の id（API の /api/clients/{id}/related）。
 * @param clientCode 利用者の記号（「B」）。置き換わった後の記号（「B様の長女」）を見せるのに使う。
 * テスト: components/clients/RelatedPeople.test.tsx。
 */
export default function RelatedPeople({
  clientId,
  clientCode,
}: {
  clientId: string;
  clientCode: string;
}) {
  const [people, setPeople] = useState<RelatedPerson[]>([]);
  /** 読み込みの状態。読めなかったことを「0人」と取り違えないよう、一覧とは別に持つ */
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [relation, setRelation] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const headingId = `${uid}-heading`;
  const relationId = `${uid}-relation`;
  const nameId = `${uid}-name`;

  const load = useCallback(async () => {
    let resp: Response;
    try {
      resp = await fetch(`/api/clients/${encodeURIComponent(clientId)}/related`);
    } catch {
      setLoadError(NETWORK_ERROR);
      setStatus("error");
      return;
    }
    const data = (await resp.json().catch(() => null)) as
      | RelatedPerson[]
      | { error?: string }
      | null;
    if (!resp.ok || !Array.isArray(data)) {
      const message = data && !Array.isArray(data) ? data.error : undefined;
      setLoadError(message || "関係者名簿を読み込めませんでした。");
      setStatus("error");
      return;
    }
    setLoadError(null);
    setPeople(data);
    setStatus("ready");
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/clients/${encodeURIComponent(clientId)}/related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation, name }),
      });
      const data = (await resp.json().catch(() => ({}))) as { error?: string };
      if (!resp.ok) throw new Error(data.error || `エラーが発生しました (${resp.status})`);
      setRelation("");
      setName("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/clients/${encodeURIComponent(clientId)}/related?relatedId=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!resp.ok) {
        const d = (await resp.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "削除に失敗しました");
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby={headingId}>
      <SectionLabel id={headingId}>関係者名簿</SectionLabel>

      {status === "loading" ? (
        <p className="mt-2 text-xs text-[var(--muted)]">読み込み中…</p>
      ) : null}

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

      {people.length > 0 ? (
        <ul className="mt-1.5">
          {people.map((p) => (
            <li key={p.id} className="client-pane-row min-h-10">
              <span id={`${uid}-${p.id}`} className="w-24 shrink-0 text-[var(--ink-2)]">
                {p.relation}
              </span>
              <span className="min-w-0 flex-1">{p.name}</span>
              <span className="client-related-alias">
                → {relatedAliasCode(clientCode, p.relation)}
              </span>
              <button
                type="button"
                onClick={() => void remove(p.id)}
                disabled={busy}
                aria-describedby={`${uid}-${p.id}`}
                className="text-action client-pane-action"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
        <IconLock size={12} className="mt-[3px] shrink-0" />
        <span>{`ここに登録した名前は、AIへ送る前に「${relatedAliasCode(clientCode, "長女")}」のような記号に置き換わります。この名簿の実名はAIには送りません。`}</span>
      </p>

      {/*
        欄の並び: 続柄（1行ぜんぶ）／氏名＋「登録」。区画は 440px と狭く、3つを横に並べると続柄の例
        「続柄・役割（例: 長女・長男・妻）」（使い方の本文 lib/manual/content.ts:113 が引く文）が途中で切れるため。
      */}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <label htmlFor={relationId} className="sr-only">
          続柄・役割
        </label>
        <input
          id={relationId}
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder={`続柄・役割（例: ${RELATION_HINTS.slice(0, 3).join("・")}）`}
          list="relation-hints"
          className={`${inputClass} col-span-2 min-h-11`}
        />
        <datalist id="relation-hints">
          {RELATION_HINTS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <label htmlFor={nameId} className="sr-only">
          氏名
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="氏名（例: 佐藤 一郎）"
          className={`${inputClass} min-h-11`}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={busy || !relation.trim() || !name.trim()}
          className={btnSecondary}
        >
          登録
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-xs text-[var(--clay)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
