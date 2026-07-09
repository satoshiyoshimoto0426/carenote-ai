"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconAlert, IconChevronRight, IconLoader, IconPlus } from "@/components/ui/icons";
import {
  btnPrimary,
  btnSecondary,
  Card,
  Field,
  inputClass,
  PageHeader,
  SectionTitle,
} from "@/components/ui/primitives";
import type { ClientRecord } from "@/types/client";

/** 利用者の属性サマリ（年齢・性別・要介護度・世帯）を1行に。 */
function attrLine(c: ClientRecord): string {
  const a = c.attributes ?? {};
  return [a.age, a.gender, a.careLevel, a.household].filter(Boolean).join(" ・ ");
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [careLevel, setCareLevel] = useState("");
  const [household, setHousehold] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/clients");
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "読み込みに失敗しました");
        setClients(data as ClientRecord[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const create = async () => {
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          attributes: { age, gender, careLevel, household },
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "作成に失敗しました");
      setClients((prev) => [data as ClientRecord, ...prev]);
      setCreating(false);
      setName("");
      setAge("");
      setGender("");
      setCareLevel("");
      setHousehold("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          kicker="Clients"
          title="利用者"
          description="利用者ごとに書類が貯まります（氏名は記号で表示）"
        />
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className={`${creating ? btnSecondary : btnPrimary} mt-1 shrink-0 whitespace-nowrap`}
        >
          {creating ? (
            "閉じる"
          ) : (
            <>
              <IconPlus size={15} />
              新規
            </>
          )}
        </button>
      </div>

      {creating && (
        <Card className="mb-8 p-6">
          <SectionTitle>新しい利用者</SectionTitle>
          <div className="mt-5 space-y-5">
            <Field
              label="氏名（任意）"
              htmlFor="c-name"
              hint="氏名は暗号化して保存し、画面では記号で表示します"
            >
              <input
                id="c-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="例: 山田 花子"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="年齢" htmlFor="c-age">
                <input
                  id="c-age"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className={inputClass}
                  placeholder="例: 85歳"
                />
              </Field>
              <Field label="性別" htmlFor="c-gender">
                <input
                  id="c-gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputClass}
                  placeholder="例: 女性"
                />
              </Field>
              <Field label="要介護度" htmlFor="c-care-level">
                <input
                  id="c-care-level"
                  value={careLevel}
                  onChange={(e) => setCareLevel(e.target.value)}
                  className={inputClass}
                  placeholder="例: 要介護2"
                />
              </Field>
              <Field label="世帯" htmlFor="c-household">
                <input
                  id="c-household"
                  value={household}
                  onChange={(e) => setHousehold(e.target.value)}
                  className={inputClass}
                  placeholder="例: 独居"
                />
              </Field>
            </div>
            <div className="pt-1">
              <button type="button" onClick={create} disabled={saving} className={btnPrimary}>
                {saving ? (
                  <>
                    <IconLoader size={15} className="animate-spin" />
                    作成中…
                  </>
                ) : (
                  "利用者を作成"
                )}
              </button>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-[var(--clay)]">
          <IconAlert size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <IconLoader size={15} className="animate-spin" />
          読み込み中…
        </div>
      ) : clients.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          まだ利用者がいません。右上の「新規」から作成してください。
        </p>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--line-soft)]">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--paper)]"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--ink)]">{c.code}様</div>
                    <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {attrLine(c) || "（属性未設定）"}
                    </div>
                  </div>
                  <IconChevronRight size={16} className="shrink-0 text-[var(--faint)]" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
