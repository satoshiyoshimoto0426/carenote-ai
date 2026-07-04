"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  const inputCls = "w-full px-3 py-2 rounded-lg bg-slate-900 text-slate-100 text-sm outline-none";
  const inputStyle = { border: "1px solid #334155" };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-100 mb-1">利用者</h1>
          <p className="text-slate-400 text-sm">利用者ごとに書類が貯まります（氏名は記号で表示）</p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="px-4 py-2 rounded-xl text-white text-sm font-bold cursor-pointer hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          {creating ? "閉じる" : "＋ 新規"}
        </button>
      </div>

      {creating && (
        <div
          className="rounded-2xl p-4 mb-6 space-y-3"
          style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #334155" }}
        >
          <div>
            <label htmlFor="c-name" className="block text-slate-300 text-xs font-semibold mb-1">
              氏名（任意・暗号化して保存し、画面では記号で表示）
            </label>
            <input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="例: 山田 花子"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="年齢（例: 85歳）"
            />
            <input
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="性別"
            />
            <input
              value={careLevel}
              onChange={(e) => setCareLevel(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="要介護度（例: 要介護2）"
            />
            <input
              value={household}
              onChange={(e) => setHousehold(e.target.value)}
              className={inputCls}
              style={inputStyle}
              placeholder="世帯（例: 独居）"
            />
          </div>
          <button
            type="button"
            onClick={create}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-white text-sm font-bold cursor-pointer hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #059669, #0891b2)" }}
          >
            {saving ? "作成中…" : "利用者を作成"}
          </button>
        </div>
      )}

      {error && <div className="text-red-300 text-sm mb-4">⚠️ {error}</div>}

      {loading ? (
        <div className="text-slate-500 text-sm">読み込み中…</div>
      ) : clients.length === 0 ? (
        <div className="text-slate-500 text-sm">
          まだ利用者がいません。「＋ 新規」から作成してください。
        </div>
      ) : (
        <div className="space-y-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between rounded-xl px-4 py-3 transition-colors hover:bg-slate-800"
              style={{ background: "rgba(15,23,42,0.5)", border: "1px solid #334155" }}
            >
              <div>
                <div className="text-slate-100 font-bold text-sm">{c.code}様</div>
                <div className="text-slate-400 text-xs">{attrLine(c) || "（属性未設定）"}</div>
              </div>
              <span className="text-slate-600 text-xs">›</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
