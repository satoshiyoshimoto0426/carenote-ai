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
import { IconFileText, IconPlus } from "@/components/ui/icons";
import { btnPrimary, Card, PageHeader, SectionTitle } from "@/components/ui/primitives";
import type { EvaluationRecord } from "@/types/evaluation";

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateFull(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

/** Maps a total score to its semantic ink color (green=優良 / amber=改善推奨 / clay=要改善). */
function scoreColor(score: number) {
  if (score >= 22) return "var(--green)";
  if (score >= 16) return "#7A5B1E";
  return "var(--clay)";
}

function ScoreBadge({ score }: { score: number }) {
  const [bg, color, border, label] =
    score >= 22
      ? ["var(--green-soft)", "var(--green)", "var(--green-line)", "優良"]
      : score >= 16
        ? ["var(--amber-soft)", "#7A5B1E", "rgba(176,130,39,0.35)", "改善推奨"]
        : ["rgba(192,73,43,0.07)", "var(--clay)", "rgba(192,73,43,0.35)", "要改善"];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: bg, color, border: `1px solid ${border}` }}
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
    <div className="animate-fadeIn mx-auto max-w-4xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader kicker="Dashboard" title="ダッシュボード" description="評価履歴とスコア推移" />
        <Link href="/evaluate" className={btnPrimary}>
          <IconPlus size={15} />
          評価を開始
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        {[
          { label: "総評価数", value: totalEvals, unit: "件" },
          { label: "平均スコア", value: avgScore, unit: "/27" },
          { label: "優良評価", value: highScoreCount, unit: "件" },
        ].map(({ label, value, unit }) => (
          <Card key={label} className="p-4 text-center">
            <div className="text-xs text-[var(--muted)]">{label}</div>
            <div
              className="mt-1 text-2xl font-medium text-[var(--ink)]"
              style={{ fontFamily: "var(--serif)" }}
            >
              {value}
              <span className="ml-0.5 text-sm font-normal text-[var(--faint)]">{unit}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Score trend chart */}
      {chartData.length >= 2 && (
        <Card className="mb-6 p-5">
          <SectionTitle className="mb-4">スコア推移（直近20件）</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ECE8E1" />
              <XAxis dataKey="label" tick={{ fill: "#9A968D", fontSize: 11 }} />
              <YAxis domain={[0, 27]} tick={{ fill: "#9A968D", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#FFFFFF",
                  border: "1px solid #E7E3DC",
                  borderRadius: 10,
                  boxShadow: "0 1px 3px rgba(28,27,25,0.06)",
                }}
                labelStyle={{ color: "#6B6862" }}
                itemStyle={{ color: "#15604D" }}
                formatter={(v: number | undefined) => [`${v ?? ""} / 27`, "スコア"]}
              />
              <ReferenceLine
                y={22}
                stroke="#CDE0D8"
                strokeDasharray="4 2"
                label={{ value: "優良", fill: "#15604D", fontSize: 10 }}
              />
              <ReferenceLine
                y={16}
                stroke="rgba(176,130,39,0.35)"
                strokeDasharray="4 2"
                label={{ value: "改善推奨", fill: "#B08227", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#15604D"
                strokeWidth={2}
                dot={{ fill: "#15604D", r: 3.5 }}
                activeDot={{ r: 5, fill: "#15604D" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* History list */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--line)] px-5 py-4">
          <SectionTitle>評価履歴</SectionTitle>
        </div>

        {loading ? (
          <div className="animate-pulse py-12 text-center text-sm text-[var(--faint)]">
            読み込み中...
          </div>
        ) : records.length === 0 ? (
          <div className="py-14 text-center">
            <div className="mb-3 flex justify-center text-[var(--faint)]">
              <IconFileText size={36} />
            </div>
            <div className="mb-5 text-sm text-[var(--muted)]">まだ評価履歴がありません</div>
            <Link href="/evaluate" className={btnPrimary}>
              最初の評価を開始する
            </Link>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 border-b border-[var(--line-soft)] px-5 py-2 text-xs font-medium text-[var(--faint)]">
              <div className="col-span-4">利用者名</div>
              <div className="col-span-3 hidden sm:block">ファイル名</div>
              <div className="col-span-2 text-center">スコア</div>
              <div className="col-span-2">判定</div>
              <div className="col-span-1 hidden text-right sm:block">日付</div>
            </div>

            {records.map((rec) => (
              <div
                key={rec.id}
                className="grid grid-cols-12 items-center gap-2 border-b border-[var(--line-soft)] px-5 py-3.5 text-sm transition-colors last:border-b-0 hover:bg-[var(--paper)]"
              >
                <div className="col-span-4 truncate font-medium text-[var(--ink)]">
                  {rec.client_name || "—"}
                </div>
                <div className="col-span-3 hidden truncate text-xs text-[var(--faint)] sm:block">
                  {rec.file_name}
                </div>
                <div className="col-span-2 text-center">
                  <span
                    className="text-lg font-medium"
                    style={{ color: scoreColor(rec.total_score), fontFamily: "var(--serif)" }}
                  >
                    {rec.total_score}
                  </span>
                  <span className="text-xs text-[var(--faint)]">/27</span>
                </div>
                <div className="col-span-2">
                  <ScoreBadge score={rec.total_score} />
                </div>
                <div className="col-span-1 hidden text-right text-xs text-[var(--faint)] sm:block">
                  {formatDateFull(rec.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
