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

/**
 * 2026-09-17 の独立審査で見つかった実害2件（どちらも実測で再現）。
 * 録音の文字起こしを流し込むようになり、どちらも「最後の関門」を壊す規模で効く。
 */
describe("敬称の取り違えと取りこぼし", () => {
  it("「〜の様子」を敬称と取り違えない（会議1本で数百か所が赤くなり確認不能になっていた）", () => {
    const c = findNameCandidates(
      "入浴の様子を確認。夜間の様子も家族から聞き取り。食事の様子は良好。",
    );
    expect(c).toEqual([]);
  });

  it("「様式」「様相」も敬称にしない", () => {
    expect(findNameCandidates("従来の様式で記録する。生活の様相が変わった。")).toEqual([]);
  });

  it("主治医の「◯◯先生」を拾う（それまで1件も拾えていなかった）", () => {
    const words = findNameCandidates("主治医の田中先生に相談。宮本先生からも助言。").map(
      (c) => c.word,
    );
    expect(words).toContain("田中");
    expect(words).toContain("宮本");
  });

  it("「氏名」は敬称ではない（欄の名前を人名にしない）", () => {
    expect(findNameCandidates("氏名を入力してください。").map((c) => c.word)).not.toContain("氏名");
  });

  it("今までどおり拾えるものは拾い続ける", () => {
    const words = findNameCandidates("長女の佐藤さんより電話。担当の田中氏へ引き継ぎ。").map(
      (c) => c.word,
    );
    expect(words).toEqual(expect.arrayContaining(["佐藤", "田中"]));
  });
});
