import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * /api/kaipoke/assessment: 二枚方式で実値に戻った下書きが来ても、AI へ渡る前に黒塗りし直す
 * （独立審査 2026-09-11 critical #7）。
 */

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "u1", orgId: null })),
}));
const db = vi.hoisted(() => ({ getClientAliases: vi.fn() }));
vi.mock("@/lib/db/clients", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/clients")>();
  return { ...orig, getClientAliases: db.getClientAliases };
});
const ai = vi.hoisted(() => ({ generateKaipokeAssessmentSheet: vi.fn() }));
vi.mock("@/lib/generation/kaipokeAssessment", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/generation/kaipokeAssessment")>();
  return { ...orig, generateKaipokeAssessmentSheet: ai.generateKaipokeAssessmentSheet };
});

const { POST } = await import("@/app/api/kaipoke/assessment/route");
const { buildKaipokeAssessmentMessage } = await import("@/lib/generation/kaipokeAssessment");

function post(body: unknown) {
  return new NextRequest("http://localhost/api/kaipoke/assessment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** /api/generate が返す「実値に戻った版」の下書き（名前は記号・番号と住所は実値） */
const RESTORED_DRAFT = {
  clientName: "A様",
  assessmentReason: "更新",
  mainComplaints: "本人: 自宅で暮らしたい",
  lifeHistory: "大阪府大阪市北区梅田1-2-3 で長女と同居",
  currentServices: "訪問介護 週2回",
  overview: "緊急連絡先 090-1234-5678（長女）",
  domains: [{ domain: "健康状態", currentStatus: "血圧140/90", analysis: "" }],
  strengths: ["長女 06-1111-2222 が毎日訪問"],
  identifiedIssues: [],
  itemsToConfirm: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "A様" }]);
});

describe("POST /api/kaipoke/assessment", () => {
  it("下書きの入れ子すべてを黒塗りしてから AI へ渡し、返事の札は戻す", async () => {
    ai.generateKaipokeAssessmentSheet.mockImplementation(async (draft: typeof RESTORED_DRAFT) => ({
      fields: [
        {
          page: 10,
          formName: "form:summarySubject",
          text: draft.overview,
          isInferred: false,
          note: "",
        },
      ],
    }));
    const res = await POST(post({ draft: RESTORED_DRAFT, notes: "山田花子さん 追加メモ" }));
    expect(res.status).toBe(200);
    const [sentDraft, sentNotes] = ai.generateKaipokeAssessmentSheet.mock.calls[0];
    const msg = buildKaipokeAssessmentMessage(sentDraft, sentNotes);
    expect(msg).not.toMatch(/1234|1111|梅田|山田/);
    expect(msg).toContain("〔電話番号1〕");
    expect(msg).toContain("〔住所1〕");
    expect(sentNotes).toBe("A様さん 追加メモ");
    const json = await res.json();
    expect(json.fields[0].text).toBe("緊急連絡先 090-1234-5678(長女)"); // 全角括弧は NFKC で半角に
  });

  it("実名が残る形なら 422 で AI を呼ばない", async () => {
    db.getClientAliases.mockResolvedValue([{ real: "山田花子", code: "山田花子様" }]);
    const res = await POST(post({ draft: { ...RESTORED_DRAFT, overview: "山田花子" } }));
    expect(res.status).toBe(422);
    expect(ai.generateKaipokeAssessmentSheet).not.toHaveBeenCalled();
  });

  it("下書きが無ければ 400", async () => {
    const res = await POST(post({ notes: "x" }));
    expect(res.status).toBe(400);
  });
});
