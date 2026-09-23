import { describe, expect, it } from "vitest";
import type { ClientRecord } from "@/types/client";
import {
  clientAttrLine,
  filterClients,
  formatRegisteredDate,
  selectedClientIdOf,
} from "./clientList";

/**
 * 利用者の一覧の決まり（lib/clients/clientList.ts）を固定する。
 * 画面（components/clients/ClientTable.tsx）の検査は ClientTable.test.tsx、選んでいる行の検査は ClientsLayout.test.tsx。
 */

/** 表に並ぶ利用者の見本（氏名は ClientRecord に無い）。 */
function client(
  id: string,
  code: string,
  attributes: ClientRecord["attributes"] = {},
): ClientRecord {
  return {
    id,
    orgId: null,
    code,
    attributes,
    createdBy: "u1",
    createdAt: "2026-09-01T00:00:00+09:00",
    updatedAt: "2026-09-01T00:00:00+09:00",
  };
}

const A = client("c1", "A", {
  age: "85歳",
  gender: "女性",
  careLevel: "要介護2",
  household: "独居",
});
const B = client("c2", "B", {
  age: "91歳",
  gender: "男性",
  careLevel: "要介護3",
  household: "長女と同居",
});
const BA = client("c3", "BA", { age: "78歳", careLevel: "要支援2" });
const F = client("c4", "F");
const ALL = [A, B, BA, F];

describe("clientAttrLine（属性の1行）", () => {
  it("アートボードと同じ「・」区切りで、年齢・性別・要介護度・世帯の順に並べる", () => {
    expect(clientAttrLine(A)).toBe("85歳・女性・要介護2・独居");
  });

  it("空の項目・空白だけの項目は飛ばす", () => {
    expect(clientAttrLine(BA)).toBe("78歳・要支援2");
    expect(clientAttrLine(client("x", "X", { age: "  ", gender: "女性" }))).toBe("女性");
  });

  it("属性が何も無ければ空文字（画面が「（属性未設定）」を出す）", () => {
    expect(clientAttrLine(F)).toBe("");
  });
});

describe("filterClients（記号・属性で探す）", () => {
  const codes = (list: ClientRecord[]) => list.map((c) => c.code);

  it("言葉が無い・空白だけなら、渡した一覧をそのまま返す", () => {
    expect(filterClients(ALL, "")).toBe(ALL);
    expect(filterClients(ALL, "  　 ")).toBe(ALL);
  });

  it("属性の言葉で絞る（並び順は変えない）", () => {
    expect(codes(filterClients(ALL, "独居"))).toEqual(["A"]);
    expect(codes(filterClients(ALL, "要介護"))).toEqual(["A", "B"]);
  });

  it("空白で区切った言葉は、全部を含む利用者だけ（全角の空白でも区切る）", () => {
    expect(codes(filterClients(ALL, "要介護 男性"))).toEqual(["B"]);
    expect(codes(filterClients(ALL, "要介護　女性"))).toEqual(["A"]);
  });

  it("全角・半角、大文字・小文字の違いでは見落とさない", () => {
    expect(codes(filterClients(ALL, "８５"))).toEqual(["A"]);
    expect(codes(filterClients(ALL, "ｂ様"))).toEqual(["B"]);
  });

  it("「B様」のように記号に「様」を付けた言葉は、その記号だけ（「BA様」は出さない）", () => {
    expect(codes(filterClients(ALL, "B様"))).toEqual(["B"]);
    expect(codes(filterClients(ALL, "BA様"))).toEqual(["BA"]);
  });

  it("「様」を付けない記号の言葉は、含む記号をすべて出す", () => {
    expect(codes(filterClients(ALL, "B"))).toEqual(["B", "BA"]);
  });

  it("当てはまる利用者がいなければ空の一覧", () => {
    expect(filterClients(ALL, "要介護5")).toEqual([]);
  });
});

describe("formatRegisteredDate（登録日の列）", () => {
  it("日本時間の年月日を、桁をそろえて出す", () => {
    expect(formatRegisteredDate("2026-09-01T00:00:00+09:00")).toBe("2026/09/01");
  });

  it("世界標準時で前の日でも、日本時間の日付にする", () => {
    // 2026-09-01 15:30 UTC ＝ 日本時間 9月2日 0:30
    expect(formatRegisteredDate("2026-09-01T15:30:00Z")).toBe("2026/09/02");
  });

  it("日付として読めない値には null（でたらめな日付を出さない）", () => {
    expect(formatRegisteredDate("")).toBeNull();
    expect(formatRegisteredDate("まだ")).toBeNull();
  });
});

describe("selectedClientIdOf（選んでいる利用者）", () => {
  it("/clients/{id} とその下なら id", () => {
    expect(selectedClientIdOf("/clients/3f1c0e2a-1b2c-4d5e-8f90-123456789abc")).toBe(
      "3f1c0e2a-1b2c-4d5e-8f90-123456789abc",
    );
    expect(selectedClientIdOf("/clients/c2/whatever")).toBe("c2");
  });

  it("一覧そのもの・ほかの画面・URL が無いときは、誰も選ばない（null）", () => {
    expect(selectedClientIdOf("/clients")).toBeNull();
    expect(selectedClientIdOf("/clients/")).toBeNull();
    expect(selectedClientIdOf("/create")).toBeNull();
    expect(selectedClientIdOf("/clientsx/c2")).toBeNull();
    expect(selectedClientIdOf(null)).toBeNull();
  });
});
