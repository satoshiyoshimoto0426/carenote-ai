import { describe, expect, it } from "vitest";
import { findNameCandidates } from "./candidates";

describe("名前っぽい言葉の候補: findNameCandidates", () => {
  it("敬称の前の言葉を候補にする（黒塗りで消えなかった家族名・担当者名）", () => {
    const c = findNameCandidates("A様の長女の佐藤さんより電話。担当の田中氏へ引き継ぎ。");
    expect(c).toContainEqual({ word: "佐藤", reason: "敬称の前" });
    expect(c).toContainEqual({ word: "田中", reason: "敬称の前" });
  });

  it("記号（A様）と札（〔…〕）は候補にしない", () => {
    const c = findNameCandidates("A様と〔電話番号1〕へ折り返し。B様も同席。");
    expect(c).toEqual([]);
  });

  it("続柄・役割の言葉は候補にしない", () => {
    const c = findNameCandidates(
      "お母さんと娘さんが来所。ケアマネさんと看護師さんに連絡。ご本人様は在宅。",
    );
    expect(c).toEqual([]);
  });

  it("施設名らしい言葉を候補にする", () => {
    const c = findNameCandidates("桜ヶ丘病院を退院し、ひまわりデイサービスを週2で利用。");
    expect(c).toContainEqual({ word: "桜ヶ丘病院", reason: "施設名の可能性" });
    expect(c).toContainEqual({ word: "ひまわりデイサービス", reason: "施設名の可能性" });
  });

  it("同じ言葉は1つにまとめる", () => {
    const c = findNameCandidates("佐藤さんに電話。佐藤さん不在。");
    expect(c.filter((x) => x.word === "佐藤")).toHaveLength(1);
  });
});
