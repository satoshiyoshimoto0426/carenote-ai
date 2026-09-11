/**
 * 提供書類の統合読解（第6段 OCR統合）の型と定数。**ブラウザでも読める純粋モジュール**。
 *
 * なぜ分けるか:
 *   rescueIntake.ts は Anthropic SDK（サーバー専用）を読み込む。画面（"use client"）が種別一覧や分類一覧を
 *   使うために rescueIntake.ts を直接 import すると、Node 専用モジュールがブラウザ向けビルドに混ざって落ちる
 *   （2026-09-11 に実際に発生）。値を使う側はこのファイルを、AI呼び出しは rescueIntake.ts を読む。
 */

/** 資料の種別（職員が指定。AIも detectedType で推定を返す） */
export type IntakeDocType =
  | "診療情報提供書"
  | "主治医意見書"
  | "看護サマリー"
  | "認定調査票"
  | "基本情報"
  | "その他";

export const INTAKE_DOC_TYPES: IntakeDocType[] = [
  "診療情報提供書",
  "主治医意見書",
  "看護サマリー",
  "認定調査票",
  "基本情報",
  "その他",
];

/** 受け付ける資料の形式（blob-upload の allowedContentTypes と一致させる） */
export type IntakeMediaType = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export const INTAKE_MEDIA_TYPES: IntakeMediaType[] = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

/** 事実の分類（アセスメントの欄に写しやすい粒度） */
export type IntakeCategory =
  | "診断・既往歴"
  | "処方・服薬"
  | "医学的管理・留意点"
  | "心身機能・ADL"
  | "認知・精神・行動"
  | "栄養・食事・嚥下"
  | "排泄・皮膚"
  | "家族・介護力・住環境"
  | "サービス利用状況"
  | "本人・家族の意向"
  | "その他";

export const INTAKE_CATEGORIES: IntakeCategory[] = [
  "診断・既往歴",
  "処方・服薬",
  "医学的管理・留意点",
  "心身機能・ADL",
  "認知・精神・行動",
  "栄養・食事・嚥下",
  "排泄・皮膚",
  "家族・介護力・住環境",
  "サービス利用状況",
  "本人・家族の意向",
  "その他",
];

export interface IntakeFact {
  category: IntakeCategory;
  /** 事実（固有名詞なし・出典は source に分離） */
  text: string;
  /** 出典（書類名。可能なら欄・ページも） */
  source: string;
  /** 事実の日付（記載があれば YYYY-MM-DD など。無ければ空） */
  date: string;
}

export interface IntakeConflict {
  /** 何についての食い違いか（例: 服薬の種類、ADLの自立度） */
  topic: string;
  /** 各資料の言い分 */
  statements: { source: string; text: string }[];
  /** どう確かめるべきか（例: 主治医へ最新処方を確認） */
  advice: string;
}

export interface IntakeDocumentReport {
  name: string;
  /** AIが読み取った種別（職員の指定と食い違えば cautions にも出る） */
  detectedType: IntakeDocType;
  readability: "良好" | "一部判読不能" | "判読不能";
}

/** 統合読解の結果。API契約の intake フィールドにそのまま載る。 */
export interface IntakeResult {
  /** 出典（書類名）付きの統合サマリ（人が読むための短い要約） */
  summary: string;
  /** 要注意点（手打ちとの矛盾・判読不能・重要リスク等） */
  cautions: string[];
  /** 出典付きの事実（分類別。下流の帳票生成の入力になる） */
  facts: IntakeFact[];
  /** 資料間の食い違い */
  conflicts: IntakeConflict[];
  /** 資料ごとの読み取り報告 */
  documents: IntakeDocumentReport[];
}
