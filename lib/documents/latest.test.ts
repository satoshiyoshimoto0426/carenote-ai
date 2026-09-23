import { describe, expect, it } from "vitest";
import type { CareDocumentMeta } from "@/types/document";
import { summarizeLatestDocs } from "./latest";

/**
 * 利用者一覧の日付の列の決まりを固定する（作り直し計画 U5）。
 * 下書きも数える・種類ごとに一番新しいものが勝つ・「更新」は利用者を登録した日とも比べる・
 * 範囲の外の利用者の行は出さない・読めない日時は黙って飛ばさない。
 */

const A = { id: "c-a", createdAt: "2026-04-01T00:00:00+00:00" };
const B = { id: "c-b", createdAt: "2026-05-01T00:00:00+00:00" };

function row(over: Partial<CareDocumentMeta>): CareDocumentMeta {
  return {
    clientId: A.id,
    docType: "assessment",
    status: "draft",
    createdAt: "2026-06-01T00:00:00+00:00",
    ...over,
  };
}

describe("種類ごとに一番新しい書類が勝つ", () => {
  const older = row({ createdAt: "2026-06-01T00:00:00+00:00", status: "approved" });
  const newer = row({ createdAt: "2026-08-15T03:00:00.123456+00:00", status: "draft" });

  it.each([
    ["古い順に来ても", [older, newer]],
    ["新しい順に来ても", [newer, older]],
  ])("%s新しい方を残す", (_name, rows) => {
    const [a] = summarizeLatestDocs([A], rows);
    expect(a.latest.assessment).toEqual({
      createdAt: "2026-08-15T03:00:00.123456+00:00",
      status: "draft",
    });
  });

  it("下書きも数える（新しい下書きが古い承認済みより勝ち、状態は下書きのまま返す）", () => {
    const [a] = summarizeLatestDocs([A], [older, newer]);
    expect(a.latest.assessment?.status).toBe("draft");
  });

  it("承認済みが一番新しければ、承認済みを返す", () => {
    const approved = row({ createdAt: "2026-09-01T00:00:00+00:00", status: "approved" });
    const [a] = summarizeLatestDocs([A], [newer, approved, older]);
    expect(a.latest.assessment).toEqual({
      createdAt: "2026-09-01T00:00:00+00:00",
      status: "approved",
    });
  });

  it("文字の並びでなく時刻で比べる（+09:00 と Z、小数点以下の桁の違い）", () => {
    // 2026-08-01T09:30:00+09:00 は 2026-08-01T00:30:00Z。文字で比べると「09:30」の方が新しく見える
    const earlierJst = row({ createdAt: "2026-08-01T09:30:00+09:00" });
    const laterUtc = row({ createdAt: "2026-08-01T01:00:00Z" });
    const [a] = summarizeLatestDocs([A], [laterUtc, earlierJst]);
    expect(a.latest.assessment?.createdAt).toBe("2026-08-01T01:00:00Z");

    // 小数点以下: 0.5 秒後の方が新しい。文字で比べると「Z」が「.」より後ろなので「…00Z」の方が新しく見える
    const withFraction = row({ docType: "carePlan", createdAt: "2026-08-02T00:00:00.5+00:00" });
    const noFraction = row({ docType: "carePlan", createdAt: "2026-08-02T00:00:00Z" });
    const [a2] = summarizeLatestDocs([A], [noFraction, withFraction]);
    expect(a2.latest.carePlan?.createdAt).toBe("2026-08-02T00:00:00.5+00:00");
  });

  it("種類ごと・利用者ごとに別々に数え、書類の無い種類は欄を作らない", () => {
    const rows = [
      row({ docType: "assessment", createdAt: "2026-06-01T00:00:00+00:00" }),
      row({ docType: "monitoring", createdAt: "2026-07-01T00:00:00+00:00", status: "approved" }),
      row({ clientId: B.id, docType: "carePlan", createdAt: "2026-06-10T00:00:00+00:00" }),
    ];
    const [a, b] = summarizeLatestDocs([A, B], rows);
    expect(a.clientId).toBe(A.id);
    expect(Object.keys(a.latest).sort()).toEqual(["assessment", "monitoring"]);
    expect(a.latest.monitoring).toEqual({
      createdAt: "2026-07-01T00:00:00+00:00",
      status: "approved",
    });
    expect(b.clientId).toBe(B.id);
    expect(Object.keys(b.latest)).toEqual(["carePlan"]);
  });
});

describe("「更新」= 一番新しい書類の日付と、利用者を登録した日のうち新しい方", () => {
  it("書類が無ければ、登録した日（利用者は必ず1行出る）", () => {
    const out = summarizeLatestDocs([A, B], []);
    expect(out).toEqual([
      { clientId: A.id, latest: {}, updatedAt: A.createdAt },
      { clientId: B.id, latest: {}, updatedAt: B.createdAt },
    ]);
  });

  it("書類の方が新しければ、種類をまたいで一番新しい書類の日付", () => {
    const rows = [
      row({ docType: "assessment", createdAt: "2026-06-01T00:00:00+00:00" }),
      row({ docType: "supportLog", createdAt: "2026-09-20T12:00:00+00:00" }),
      row({ docType: "carePlan", createdAt: "2026-07-01T00:00:00+00:00" }),
    ];
    const [a] = summarizeLatestDocs([A], rows);
    expect(a.updatedAt).toBe("2026-09-20T12:00:00+00:00");
  });

  it("登録した日の方が新しければ（書類を先に移した場合など）、登録した日", () => {
    const late = { id: "c-late", createdAt: "2026-09-10T00:00:00+00:00" };
    const rows = [row({ clientId: late.id, createdAt: "2026-06-01T00:00:00+00:00" })];
    const [c] = summarizeLatestDocs([late], rows);
    expect(c.updatedAt).toBe(late.createdAt);
    // 種類の列は書類の日付のまま（「更新」だけが登録した日になる）
    expect(c.latest.assessment?.createdAt).toBe("2026-06-01T00:00:00+00:00");
  });
});

describe("範囲と失敗", () => {
  it("渡された利用者に無い id の行は出さない（範囲の外の利用者の日付を返さない）", () => {
    const rows = [row({ clientId: "c-other", createdAt: "2026-09-23T00:00:00+00:00" })];
    const out = summarizeLatestDocs([A], rows);
    expect(out).toEqual([{ clientId: A.id, latest: {}, updatedAt: A.createdAt }]);
    expect(JSON.stringify(out)).not.toContain("c-other");
  });

  it("並びは受け取った利用者の並びのまま", () => {
    const out = summarizeLatestDocs([B, A], [row({})]);
    expect(out.map((c) => c.clientId)).toEqual([B.id, A.id]);
  });

  it("書類の日時が読めなければ投げる（黙って飛ばして「まだありません」に見せない）", () => {
    expect(() => summarizeLatestDocs([A], [row({ createdAt: "not a date" })])).toThrow(
      "日時として読めない値があります",
    );
  });

  it("利用者の登録日が読めなければ投げる", () => {
    expect(() => summarizeLatestDocs([{ id: "c-x", createdAt: "" }], [])).toThrow(
      "日時として読めない値があります",
    );
  });
});
