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
  if (score >= 16) return "var(--amber)";
  return "var(--clay)";
}

function ScoreBadge({ score }: { score: number }) {
  const [bg, color, border, label] =
    score >= 22
      ? ["var(--green-soft)", "var(--green)", "var(--green-line)", "優良"]
      : score >= 16
        ? ["var(--amber-soft)", "var(--amber)", "var(--amber-line)", "改善推奨"]
        : ["var(--clay-soft)", "var(--clay)", "var(--clay)", "要改善"];
  return (
    <span
      className="rounded-[6px] px-2 py-0.5 text-xs font-medium"
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  );
}

/**
 * ダッシュボード（/dashboard）。本人の評価（点検）の履歴を GET /api/history で読み、件数・平均・推移・一覧を出す。
 * 作り直し計画では「点検」の中へ移す（吉本さん決定 2026-09-23・後のマイルストーン）。
 *
 * 履歴を読めなかったとき（503 など）は、件数を 0 と出さず（「—」）、一覧の場所に読めなかったことを文字で出す
 * （2026-09-24 検収の指摘 ── 以前は失敗を黙って捨て、「まだ評価履歴がありません」と見えていた）。
 */
export default function DashboardPage() {
  const [records, setRecords] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  /** 履歴を読めなかったときの文（読めたら null）。0件と取り違えないよう別に持つ */
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/history");
        const data = (await r.json().catch(() => null)) as
          | EvaluationRecord[]
          | { error?: string }
          | null;
        if (!r.ok || !Array.isArray(data)) {
          const message = data && !Array.isArray(data) ? data.error : undefined;
          setLoadError(message || "評価の履歴を読み込めませんでした。");
          return;
        }
        setRecords(data);
      } catch {
        setLoadError(
          "評価の履歴を読み込めませんでした。通信環境を確かめて、もう一度お試しください。",
        );
      } finally {
        setLoading(false);
      }
    })();
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
    <div className="animate-fadeIn app-page">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="ダッシュボード" description="評価履歴とスコア推移" helpAnchor="ch1" />
        <Link href="/evaluate" className={btnPrimary}>
          <IconPlus size={15} />
          評価を開始
        </Link>
      </div>

      {/* Stats */}
      <div className="mb-[var(--sp-4)] grid grid-cols-3 gap-3">
        {[
          // 読めなかったときは 0 と出さない（0件と取り違えさせない）
          { label: "総評価数", value: loadError ? "—" : totalEvals, unit: "件" },
          { label: "平均スコア", value: loadError ? "—" : avgScore, unit: "/27" },
          { label: "優良評価", value: loadError ? "—" : highScoreCount, unit: "件" },
        ].map(({ label, value, unit }) => (
          <Card key={label} className="px-4 py-5 text-center">
            <div className="text-[12px] font-medium text-[var(--muted)]">{label}</div>
            <div className="tnum mt-1.5 text-[26px] font-bold leading-none text-[var(--ink)]">
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
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-soft)" />
              <XAxis dataKey="label" tick={{ fill: "var(--faint)", fontSize: 11 }} />
              <YAxis domain={[0, 27]} tick={{ fill: "var(--faint)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  boxShadow: "0 1px 3px rgba(28,27,25,0.06)",
                }}
                labelStyle={{ color: "var(--muted)" }}
                itemStyle={{ color: "var(--green)" }}
                formatter={(v: number | undefined) => [`${v ?? ""} / 27`, "スコア"]}
              />
              <ReferenceLine
                y={22}
                stroke="var(--green-line)"
                strokeDasharray="4 2"
                label={{ value: "優良", fill: "var(--green)", fontSize: 10 }}
              />
              <ReferenceLine
                y={16}
                stroke="var(--amber-line)"
                strokeDasharray="4 2"
                label={{ value: "改善推奨", fill: "var(--amber)", fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--green)"
                strokeWidth={2}
                dot={{ fill: "var(--green)", r: 3.5 }}
                activeDot={{ r: 5, fill: "var(--green)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* History list — 残りの高さを埋める（中身が少ない画面が上に貼りつかないように） */}
      <Card
        className={`flex flex-col overflow-hidden ${
          records.length === 0 ? "min-h-[260px] flex-1" : ""
        }`}
      >
        <div className="border-b border-[var(--line)] px-5 py-4">
          <SectionTitle>評価履歴</SectionTitle>
        </div>

        {loading ? (
          <div className="animate-pulse py-12 text-center text-sm text-[var(--faint)]">
            読み込み中...
          </div>
        ) : loadError ? (
          <div role="alert" className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-[var(--clay)]">{loadError}</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-16 text-center">
            <div className="mb-4 text-[var(--faint)]">
              <IconFileText size={34} />
            </div>
            <div className="mb-1 text-[15px] font-bold text-[var(--ink)]">
              まだ評価履歴がありません
            </div>
            <p className="mb-6 max-w-[26rem] text-[13px] leading-relaxed text-[var(--muted)]">
              ケアプランのPDFを読み込ませると、8つの観点で採点した結果がここに並びます。
            </p>
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
                className="grid grid-cols-12 items-center gap-2 border-b border-[var(--line-soft)] px-5 py-3.5 text-sm transition-colors last:border-b-0 hover:bg-[var(--surface-2)]"
              >
                <div className="col-span-4 truncate font-medium text-[var(--ink)]">
                  {rec.client_name || "—"}
                </div>
                <div className="col-span-3 hidden truncate text-xs text-[var(--faint)] sm:block">
                  {rec.file_name}
                </div>
                <div className="col-span-2 text-center">
                  <span
                    className="tnum text-lg font-medium"
                    style={{ color: scoreColor(rec.total_score) }}
                  >
                    {rec.total_score}
                  </span>
                  <span className="tnum text-xs text-[var(--faint)]">/27</span>
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
