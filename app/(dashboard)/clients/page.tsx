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
import { fetchClientList } from "@/lib/clients/listError";
import type { ClientRecord } from "@/types/client";

/** 利用者の属性サマリ（年齢・性別・要介護度・世帯）を1行に。 */
function attrLine(c: ClientRecord): string {
  const a = c.attributes ?? {};
  return [a.age, a.gender, a.careLevel, a.household].filter(Boolean).join(" ・ ");
}

/**
 * 利用者の一覧と新規登録（/clients）。一覧は GET /api/clients、登録は POST /api/clients。
 * 一覧を読めなかったときは「まだ利用者がいません」を出さず、読めなかったことだけを出す
 * （2026-09-23 作り直し計画 U0 ── 失敗を空の一覧に見せない。U1 で作業台の表に作り直す）。
 */
export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /** 一覧の読み込みの失敗（登録の失敗 error とは分ける ── 空の一覧の表示を止めるため） */
  const [loadError, setLoadError] = useState<string | null>(null);
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
      const result = await fetchClientList();
      if (result.ok) setClients(result.clients);
      else setLoadError(result.message);
      setLoading(false);
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
    <div className="app-page">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="利用者"
          description="利用者ごとに書類が貯まります（氏名は記号で表示）"
          helpAnchor="ch2"
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

      {loadError && (
        <div role="alert" className="mb-4 flex items-center gap-2 text-sm text-[var(--clay)]">
          <IconAlert size={15} className="shrink-0" />
          {loadError}
        </div>
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
        // 読めなかったのに「まだ利用者がいません」と出すと、失敗が空の一覧に化ける
        loadError === null && (
          <Card className="flex min-h-[220px] flex-1 flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-1 text-[15px] font-bold text-[var(--ink)]">まだ利用者がいません</div>
            <p className="max-w-[26rem] text-[13px] leading-relaxed text-[var(--muted)]">
              右上の「新規」から登録してください。登録した氏名は暗号化して保存し、 画面では{" "}
              <span className="code-chip">A様</span> のような記号で表示します。
            </p>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-[var(--line-soft)]">
            {clients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-[18px] transition-colors hover:bg-[var(--surface-2)]"
                >
                  <div className="min-w-0">
                    <span className="code-chip inline-block">{c.code}様</span>
                    <div className="mt-2 truncate text-[12.5px] text-[var(--muted)]">
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
