"use client";

/**
 * 関係者名簿（D4）: 利用者ごとに家族・担当者・主治医などを登録する。
 * 登録した名前は黒塗りで「A様の長女」のような記号に置き換わり、AIへは出ない。
 * 実名はログイン職員の画面にだけ表示する。
 */
import { useCallback, useEffect, useState } from "react";
import type { RelatedPerson } from "@/lib/db/clients";
import { relatedAliasCode } from "@/lib/privacy/pseudonymize";

interface Props {
  clientId: string;
  clientCode: string;
  inputClass: string;
  primaryClass: string;
  secondaryClass: string;
}

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

export default function RelatedPeople({
  clientId,
  clientCode,
  inputClass,
  primaryClass,
  secondaryClass,
}: Props) {
  const [people, setPeople] = useState<RelatedPerson[]>([]);
  const [relation, setRelation] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const resp = await fetch(`/api/clients/${clientId}/related`);
      const data = await resp.json();
      if (resp.ok) setPeople(data as RelatedPerson[]);
    } catch {
      // 一覧の取得失敗は画面上の空表示で足りる（追加時にエラーが出る）
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/clients/${clientId}/related`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relation, name }),
      });
      const data = await resp.json();
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
        `/api/clients/${clientId}/related?relatedId=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
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
    <section className="rounded-[12px] border border-[var(--paper)] bg-white p-4">
      <h3 className="text-sm font-medium">関係者名簿</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        ご家族や関係先の方の名前を登録すると、メモの中の名前が「{clientCode}
        様の長女」のような記号に置き換わってからAIへ送られます。 実名はこの画面にだけ表示します。
      </p>

      {people.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {people.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-[10px] bg-[var(--paper)] px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium">{p.relation}</span>
                <span className="ml-2">{p.name}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">
                  → {relatedAliasCode(clientCode, p.relation)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                className={`${secondaryClass} text-xs`}
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <input
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          placeholder={`続柄・役割（例: ${RELATION_HINTS.slice(0, 3).join("・")}）`}
          list="relation-hints"
          className={inputClass}
        />
        <datalist id="relation-hints">
          {RELATION_HINTS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="氏名（例: 佐藤 一郎）"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !relation.trim() || !name.trim()}
          className={primaryClass}
        >
          登録
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-[var(--clay)]">{error}</p>}
    </section>
  );
}
