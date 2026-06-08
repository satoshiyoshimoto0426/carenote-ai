"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { EvaluationRecord } from "@/types/evaluation";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function ScoreBadge({ score }: { score: number }) {
  const [bg, color, label] =
    score >= 22
      ? ["rgba(16,185,129,0.15)", "#10b981", "優良"]
      : score >= 16
        ? ["rgba(245,158,11,0.15)", "#f59e0b", "改善推奨"]
        : ["rgba(239,68,68,0.15)", "#ef4444", "要改善"];
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ background: bg, color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}

export default function DashboardPage() {
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setRecords(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalEvals = records.length;
  const avgScore = totalEvals
    ? Math.round((records.reduce((s, r) => s + r.total_score, 0) / totalEvals) * 10) / 10
    : 0;
  const highScoreCount = records.filter((r) => r.total_score >= 22).length;

  const chartData = [...records]
    .reverse()
    .slice(-20)
    .map((r) => ({
      label: formatDate(r.created_at),
      score: r.total_score,
    }));

  return (
    <div className="animate-fadeIn max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-slate-100">ダッシュボード</h1>
          <p className="text-slate-400 text-sm mt-0.5">評価履歴とスコア推移</p>
        </div>
        <Link
          href="/evaluate"
          className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
        >
          ＋ 評価を開始
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "総評価数", value: totalEvals, unit: "件" },
          { label: "平均スコア", value: avgScore, unit: "/27" },
          { label: "優良評価", value: highScoreCount, unit: "件" },
        ].map(({ label, value, unit }) => (
          <div
            key={label}
            className="rounded-2xl p-4 text-center"
            style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              border: "1px solid #334155",
            }}
          >
            <div className="text-slate-400 text-xs mb-1">{label}</div>
            <div className="text-2xl font-black text-slate-100">
              {value}
              <span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Score trend chart */}
      {chartData.length >= 2 && (
        <div
          className="rounded-2xl p-5 mb-6"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
            border: "1px solid #334155",
          }}
        >
          <div className="text-slate-300 font-bold text-sm mb-4">📈 スコア推移（直近20件）</div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} />
              <YAxis domain={[0, 27]} tick={{ fill: "#64748b", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: "#60a5fa" }}
                formatter={(v: number | undefined) => [`${v ?? ""} / 27`, "スコア"]}
              />
              <ReferenceLine
                y={22}
                stroke="#10b98155"
                strokeDasharray="4 2"
                label={{ value: "優良", fill: "#10b981", fontSize: 10 }}
              />
              <ReferenceLine
                y={16}
                stroke="#f59e0b55"
                strokeDasharray="4 2"
                label={{ value: "改善推奨", fill: "#f59e0b", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={{ fill: "#3b82f6", r: 4 }}
                activeDot={{ r: 6, fill: "#60a5fa" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* History list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
          border: "1px solid #334155",
        }}
      >
        <div className="px-5 py-4" style={{ borderBottom: "1px solid #334155" }}>
          <div className="text-slate-300 font-bold text-sm">📋 評価履歴</div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500 text-sm animate-pulse">
            読み込み中...
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-14">
            <div className="text-5xl mb-3">📁</div>
            <div className="text-slate-400 text-sm mb-5">まだ評価履歴がありません</div>
            <Link
              href="/evaluate"
              className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
            >
              最初の評価を開始する
            </Link>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div
              className="grid grid-cols-12 gap-2 px-5 py-2 text-xs text-slate-500 font-semibold"
              style={{ borderBottom: "1px solid #1e293b" }}
            >
              <div className="col-span-4">利用者名</div>
              <div className="col-span-3 hidden sm:block">ファイル名</div>
              <div className="col-span-2 text-center">スコア</div>
              <div className="col-span-2">判定</div>
              <div className="col-span-1 hidden sm:block text-right">日付</div>
            </div>

            {records.map((rec) => (
              <div
                key={rec.id}
                className="grid grid-cols-12 gap-2 px-5 py-3.5 items-center text-sm transition-colors hover:bg-slate-800/30"
                style={{ borderBottom: "1px solid #1e293b22" }}
              >
                <div className="col-span-4 text-slate-200 font-medium truncate">
                  {rec.client_name || "—"}
                </div>
                <div className="col-span-3 text-slate-500 text-xs truncate hidden sm:block">
                  {rec.file_name}
                </div>
                <div className="col-span-2 text-center">
                  <span
                    className="font-black text-lg"
                    style={{
                      color:
                        rec.total_score >= 22
                          ? "#10b981"
                          : rec.total_score >= 16
                            ? "#f59e0b"
                            : "#ef4444",
                    }}
                  >
                    {rec.total_score}
                  </span>
                  <span className="text-slate-500 text-xs">/27</span>
                </div>
                <div className="col-span-2">
                  <ScoreBadge score={rec.total_score} />
                </div>
                <div className="col-span-1 text-slate-500 text-xs text-right hidden sm:block">
                  {formatDateFull(rec.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
