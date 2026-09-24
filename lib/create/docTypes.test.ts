import { describe, expect, it } from "vitest";
import { DOC_ORDER, DOC_TYPE_LABELS, type DocTypeLabels } from "./docTypes";

/**
 * 書類の種類の並び順と名前を固定する。
 *
 * なぜ必要か: 3つの画面（つくる・利用者の画面・救済モード）に別々に書かれていた名前を
 * 1か所へ集めた（2026-09-23）。集めるときに1文字でも変わると、職員が見る画面と
 * マニュアル（lib/manual/content.ts）・動画の字幕が食い違う。ここに書いた期待値は、
 * 集める前の各画面の文字をそのまま写したもの。名前を変えるときは、マニュアルも同じ変更で直す。
 */

describe("DOC_ORDER", () => {
  it("ケアマネジメントの流れ順（アセス → プラン → 会議 → 経過 → モニタリング）", () => {
    expect(DOC_ORDER).toEqual([
      "assessment",
      "carePlan",
      "meetingSummary",
      "supportLog",
      "monitoring",
    ]);
  });

  it("5種類を1回ずつ並べ、名前の表とずれがない", () => {
    expect(new Set(DOC_ORDER).size).toBe(DOC_ORDER.length);
    expect([...DOC_ORDER].sort()).toEqual(Object.keys(DOC_TYPE_LABELS).sort());
  });
});

describe("DOC_TYPE_LABELS ── 集める前の画面の文字と同じ", () => {
  /** 名前の表から、1つの欄だけを種類の順に取り出す。 */
  const column = (key: keyof DocTypeLabels) => DOC_ORDER.map((t) => DOC_TYPE_LABELS[t][key]);

  it("つくるの種類ボタン（旧 create/page.tsx の DOC_META.label）", () => {
    expect(column("tab")).toEqual([
      "アセスメント",
      "ケアプラン（第1・2表）",
      "担当者会議（第4表）",
      "支援経過（第5表）",
      "モニタリング",
    ]);
  });

  it("つくるの説明の1行（旧 create/page.tsx の DOC_META.description）", () => {
    expect(column("description")).toEqual([
      "面談メモから課題分析の下書き",
      "アセス結果から計画書の下書き",
      "会議メモから要点の下書き",
      "対応メモから経過記録の下書き",
      "前回プラン＋最新状況から記録の下書き",
    ]);
  });

  it("利用者の画面の書類の行（旧 clients/[id]/page.tsx の DOC_LABELS）", () => {
    expect(column("saved")).toEqual([
      "アセスメント（課題分析）",
      "ケアプラン 第1・2表",
      "第4表 担当者会議の要点",
      "第5表 支援経過",
      "モニタリング",
    ]);
  });

  it("救済モードの結果の見出し（旧 rescue/page.tsx の DOC_ORDER.label）", () => {
    expect(column("bundle")).toEqual([
      "アセスメント（課題分析）",
      "ケアプラン 第1・2表",
      "第4表 サービス担当者会議の要点",
      "第5表 支援経過",
      "モニタリング",
    ]);
  });

  it("送る場所の「作るもの」（A案のアートボード。担当者会議はアートボードの文字どおり）", () => {
    expect(DOC_TYPE_LABELS.meetingSummary.output).toBe("サービス担当者会議の要点（第4表）");
    expect(column("output")).toEqual([
      "アセスメント（課題分析）",
      "居宅サービス計画書（第1・2表）",
      "サービス担当者会議の要点（第4表）",
      "居宅介護支援経過（第5表）",
      "モニタリング記録",
    ]);
  });

  it("どの名前も空ではなく、前後に空白がない", () => {
    for (const t of DOC_ORDER) {
      for (const value of Object.values(DOC_TYPE_LABELS[t])) {
        expect(value.length).toBeGreaterThan(0);
        expect(value).toBe(value.trim());
      }
    }
  });
});
