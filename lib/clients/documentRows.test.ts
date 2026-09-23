import { describe, expect, it } from "vitest";
import { DOC_ORDER } from "@/lib/create/docTypes";
import type { CareDocumentRecord, CareDocumentType } from "@/types/document";
import { groupDocumentsByType } from "./documentRows";

/**
 * 利用者の画面の書類の行（lib/clients/documentRows.ts）。
 * 種類ごとに1行へまとめても、**以前の版を1つも落とさない**ことを縛る（A6 ＝ 計画 U3b の受け入れ条件「どの版も開ける」）。
 */

function doc(id: string, docType: string, createdAt: string): CareDocumentRecord {
  return {
    id,
    clientId: "c1",
    orgId: null,
    docType: docType as CareDocumentType,
    status: "draft",
    content: {},
    source: "rescue",
    retentionUntil: "2031-01-01",
    approvedAt: null,
    approvedBy: null,
    createdBy: "u1",
    createdAt,
    updatedAt: createdAt,
  };
}

describe("groupDocumentsByType", () => {
  it("書類が無くても、5種類の行を DOC_ORDER の順に必ず返す", () => {
    const { rows, others } = groupDocumentsByType([]);
    expect(rows.map((r) => r.type)).toEqual([...DOC_ORDER]);
    expect(rows.every((r) => r.latest === null && r.older.length === 0)).toBe(true);
    expect(others).toEqual([]);
  });

  it("同じ種類は、いちばん新しい版を latest に、残りを新しい順に older へ入れる（受け取った順に頼らない）", () => {
    const docs = [
      doc("old", "carePlan", "2026-07-01T00:00:00+09:00"),
      doc("new", "carePlan", "2026-09-01T00:00:00+09:00"),
      doc("mid", "carePlan", "2026-08-01T00:00:00+09:00"),
    ];
    const carePlan = groupDocumentsByType(docs).rows.find((r) => r.type === "carePlan");
    expect(carePlan?.latest?.id).toBe("new");
    expect(carePlan?.older.map((d) => d.id)).toEqual(["mid", "old"]);
  });

  it("どの書類も latest・older・others のどこか1か所にだけ入る（落とさない・二重にしない）", () => {
    const docs = [
      doc("a1", "assessment", "2026-09-01T00:00:00Z"),
      doc("a2", "assessment", "2026-09-02T00:00:00Z"),
      doc("m1", "monitoring", "2026-09-03T00:00:00Z"),
      doc("x1", "facesheet", "2026-09-04T00:00:00Z"),
      doc("s1", "supportLog", "読めない日時"),
      doc("s2", "supportLog", "2026-09-05T00:00:00Z"),
    ];
    const { rows, others } = groupDocumentsByType(docs);
    const placed = [
      ...rows.flatMap((r) => [...(r.latest ? [r.latest] : []), ...r.older]),
      ...others,
    ].map((d) => d.id);
    expect([...placed].sort()).toEqual(docs.map((d) => d.id).sort());
    expect(others.map((d) => d.id)).toEqual(["x1"]);
    // 日時が読めない版は一番古い扱い（新しい版を押しのけない）
    expect(rows.find((r) => r.type === "supportLog")?.latest?.id).toBe("s2");
  });

  it("受け取った配列の並びを変えない", () => {
    const docs = [
      doc("a", "assessment", "2026-01-01T00:00:00Z"),
      doc("b", "assessment", "2026-02-01T00:00:00Z"),
    ];
    groupDocumentsByType(docs);
    expect(docs.map((d) => d.id)).toEqual(["a", "b"]);
  });
});
