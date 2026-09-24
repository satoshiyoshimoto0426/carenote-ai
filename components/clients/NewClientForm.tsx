"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { IconAlert, IconLoader } from "@/components/ui/icons";
import { btnPrimary, Field, inputClass, PaneHeader, TextAction } from "@/components/ui/primitives";
import type { ClientRecord } from "@/types/client";
import { useClients } from "./ClientsContext";

/** POST /api/clients の応答が、登録した利用者の形（id と code がある）か。 */
function isClientRecord(value: unknown): value is ClientRecord {
  if (value === null || typeof value !== "object") return false;
  const v = value as { id?: unknown; code?: unknown };
  return typeof v.id === "string" && v.id !== "" && typeof v.code === "string";
}

/** 失敗の応答の本文から、サーバーの文（error）を取り出す。無ければ null。 */
function serverErrorOf(value: unknown): string | null {
  if (value === null || typeof value !== "object" || !("error" in value)) return null;
  const error = (value as { error: unknown }).error;
  return typeof error === "string" && error.trim() !== "" ? error : null;
}

/**
 * 新しい利用者の登録の欄（右の区画・/clients?new=1 ── app/(dashboard)/clients/page.tsx が出す）。
 *
 * 何をするか: 氏名（任意）・年齢・性別・要介護度・世帯を POST /api/clients へ送り、登録できたら
 *   一覧の表の先頭へ読み直さずに足して（ClientsContext の addClient ── 計画 U2 の指摘）、その利用者の画面
 *   （/clients/{id}）を開く。付いた記号（A様など）がその場で分かり、次に関係者名簿や「つくる」へ進める。
 * 氏名は暗号化して保存し（lib/db/clients.ts の createClientRecord）、画面には記号でしか出さない。
 * 欄の id（#c-name #c-age #c-gender #c-care-level #c-household）・名前・「氏名は暗号化して…」の添え書きは
 * 以前の一覧の画面と同じ（撮影の道具 tools/shoot-plans.mjs と職員向けマニュアルがこの id と文字を使う）。
 *
 * 一覧を読めていないあいだは登録を止める: 表が見えないと、もういる方を気づかずに二重に登録できてしまう
 * （記録が2か所に分かれ、氏名の表記が空白だけ違うと名簿の安全網が別人とみなして事業所全体の送信が止まる
 * ── 計画 U0 で救済モードの保存を止めたのと同じ理由）。
 * テスト: components/clients/ClientsLayout.test.tsx（登録した利用者が読み直さずに表に出る・読めないときは登録できない）。
 */
export default function NewClientForm() {
  const router = useRouter();
  const { status, addClient } = useClients();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [careLevel, setCareLevel] = useState("");
  const [household, setHousehold] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listReady = status === "ready";

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!listReady || saving) return;
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
      let data: unknown = null;
      try {
        data = await resp.json();
      } catch {
        data = null;
      }
      if (!resp.ok) throw new Error(serverErrorOf(data) ?? "作成に失敗しました");
      if (!isClientRecord(data)) throw new Error("作成に失敗しました");
      addClient(data);
      router.push(`/clients/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PaneHeader title="新しい利用者">
        <TextAction href="/clients" className="ml-auto">
          やめる
        </TextAction>
      </PaneHeader>
      <form onSubmit={create} className="space-y-5 px-6 pt-6 pb-10">
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
            autoComplete="off"
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
        {status === "error" && (
          <p className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--clay)]">
            <IconAlert size={15} className="mt-1 shrink-0" />
            利用者一覧を読めないあいだは、同じ方を二重に登録しないよう、登録を止めています。「一覧をもう一度読む」で一覧を読めたら、登録できます。
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 text-[13px] leading-relaxed text-[var(--clay)]"
          >
            <IconAlert size={15} className="mt-1 shrink-0" />
            {error}
          </p>
        )}
        <div className="pt-1">
          <button type="submit" disabled={!listReady || saving} className={btnPrimary}>
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
      </form>
    </>
  );
}
