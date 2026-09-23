import type { CareDocumentType } from "@/types/document";

/**
 * 書類（帳票）の種類の並び順と、画面ごとの名前の正本。
 *
 * なぜ存在するか: 同じ5種類の書類の順番と名前が、つくる（app/(dashboard)/create/page.tsx の DOC_META）・
 * 利用者の画面（clients/[id]/page.tsx の DOC_LABELS）・救済モード（rescue/page.tsx の DOC_ORDER）に
 * 別々に書かれていた。A案では利用者の画面から「つくる」へ種類つきで飛ぶ（?type=…）・利用者一覧に
 * 種類ごとの日付を並べる、など種類の並びを複数の画面が共有するので、1か所に集めた。
 *
 * 名前は画面ごとに**わざと違う**（例: 担当者会議は、つくるのボタンでは「担当者会議（第4表）」、
 * 利用者の画面では「第4表 担当者会議の要点」、救済モードの見出しでは「第4表 サービス担当者会議の要点」）。
 * 集めただけで、画面に出る文字は1文字も変えていない（lib/create/docTypes.test.ts が固定する）。
 * 画面の文字をそろえるかどうかは、マニュアル（lib/manual/content.ts）の書き直しと一緒に後で決める。
 *
 * 繋がる先: types/document.ts の CareDocumentType（保存する書類の種類）と同じ5種類。
 * API の受け付ける種類（app/api/documents/route.ts の ALLOWED_TYPES）も同じ5種類。
 */

/**
 * 書類の並び順（ケアマネジメントの流れ順）。
 * アセスメント → ケアプラン（第1・2表）→ 担当者会議（第4表）→ 支援経過（第5表）→ モニタリング。
 */
export const DOC_ORDER: readonly CareDocumentType[] = [
  "assessment",
  "carePlan",
  "meetingSummary",
  "supportLog",
  "monitoring",
];

/** 1種類の書類の、画面ごとの名前。 */
export interface DocTypeLabels {
  /** つくるの種類ボタンの名前。緑のボタン「{tab}の下書きを作る」にも入る。 */
  tab: string;
  /** つくるの種類ボタンの下に出す、1行の説明。 */
  description: string;
  /** 利用者の画面で、保存した書類の行（と、まだ無い種類の「つくる」行）に出す名前。 */
  saved: string;
  /** 救済モード（一式まとめて）の結果で、書類ごとの見出しと「一式をまとめてコピー」の区切りに出す名前。 */
  bundle: string;
  /**
   * 送る場所の「作るもの」に出す、正式な書類の名前（A案のアートボード Main.dc.html の送信の帯）。
   * まだどの画面にも出していない（つくるを作業台の形にするスライスで出す）。
   * 担当者会議の名前はアートボードどおり。ほかの4つは同じ形（正式名＋表の番号）に合わせた案で、
   * 画面に出す前に吉本さんの確認が要る。
   */
  output: string;
}

/** 書類の種類ごとの名前（どの画面のどの名前かは DocTypeLabels の各欄を参照）。 */
export const DOC_TYPE_LABELS: Readonly<Record<CareDocumentType, DocTypeLabels>> = {
  assessment: {
    tab: "アセスメント",
    description: "面談メモから課題分析の下書き",
    saved: "アセスメント（課題分析）",
    bundle: "アセスメント（課題分析）",
    output: "アセスメント（課題分析）",
  },
  carePlan: {
    tab: "ケアプラン（第1・2表）",
    description: "アセス結果から計画書の下書き",
    saved: "ケアプラン 第1・2表",
    bundle: "ケアプラン 第1・2表",
    output: "居宅サービス計画書（第1・2表）",
  },
  meetingSummary: {
    tab: "担当者会議（第4表）",
    description: "会議メモから要点の下書き",
    saved: "第4表 担当者会議の要点",
    bundle: "第4表 サービス担当者会議の要点",
    output: "サービス担当者会議の要点（第4表）",
  },
  supportLog: {
    tab: "支援経過（第5表）",
    description: "対応メモから経過記録の下書き",
    saved: "第5表 支援経過",
    bundle: "第5表 支援経過",
    output: "居宅介護支援経過（第5表）",
  },
  monitoring: {
    tab: "モニタリング",
    description: "前回プラン＋最新状況から記録の下書き",
    saved: "モニタリング",
    bundle: "モニタリング",
    output: "モニタリング記録",
  },
};
