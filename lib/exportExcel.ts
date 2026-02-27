import * as XLSX from "xlsx";
import { EvaluationResult } from "@/types/evaluation";

export function exportToExcel(result: EvaluationResult, fileName?: string) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ["CareNote AI — ケアプラン評価レポート"],
    [],
    ["利用者名", result.client_name],
    ["総合スコア", `${result.total_score} / 27`],
    ["総合判定", result.total_score >= 22 ? "優良" : result.total_score >= 16 ? "改善推奨" : "要改善"],
    ["総合コメント", result.evaluator_comment],
    [],
    ["━━ カテゴリ別スコア ━━"],
    ["カテゴリ", "得点", "満点", "達成率"],
    ...result.categories.map((c) => [
      c.name,
      c.score,
      c.max_score,
      `${Math.round((c.score / c.max_score) * 100)}%`,
    ]),
    [],
    ["━━ 最優先改善事項 ━━"],
    ...result.priority_improvements.map((item, i) => [`${i + 1}. ${item}`]),
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "評価サマリー");

  // Detail sheet
  const detailRows: (string | number)[][] = [
    ["カテゴリ", "得点", "満点", "良い点", "課題点", "改善アドバイス"],
  ];
  for (const c of result.categories) {
    const maxRows = Math.max(c.good_points.length, c.issues.length, 1);
    for (let i = 0; i < maxRows; i++) {
      detailRows.push([
        i === 0 ? c.name : "",
        i === 0 ? c.score : "",
        i === 0 ? c.max_score : "",
        c.good_points[i] ?? "",
        c.issues[i] ?? "",
        i === 0 ? c.advice : "",
      ]);
    }
    detailRows.push([]);
  }
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  wsDetail["!cols"] = [
    { wch: 28 }, { wch: 6 }, { wch: 6 }, { wch: 40 }, { wch: 40 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, "カテゴリ詳細");

  const safeName = (result.client_name || "評価結果").replace(/[\\/:*?"<>|]/g, "_");
  XLSX.writeFile(wb, fileName ?? `CareNoteAI_${safeName}.xlsx`);
}
