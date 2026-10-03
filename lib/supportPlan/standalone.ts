import type { SupportPlanABasic } from "@/types/supportPlanA";
import type { SupportPlanAMeta } from "./format";

/**
 * 就労A型の個別支援計画書を作る単独の画面（app/support-plan-a/）の入力欄の値と、その組み立て。純粋な関数だけ。
 *
 * なぜあるか: 段階2（docs/TASK-LEDGER.md T-SPA-01）の画面は名簿を使わない（CareNote の外枠・利用者一覧に足さない
 *   ── 2026-10-03 吉本さんの決定②「単独で出す」）。名簿の代わりに画面で基本情報を受け取り、
 *   AI に渡す「利用者の基本情報」の文・様式の外の値（SupportPlanAMeta）・1章の名簿の値に分ける。
 * 決まり: 氏名・受給者証番号は受け取らない（様式の ID化の原則 ── 利用者コードだけ）。空の欄は AI に渡さない。
 * 何と繋がるか: 画面＝components/supportPlan/SupportPlanAWorkbench.tsx、様式の組み立て＝lib/supportPlan/format.ts。
 */

/**
 * 表示スイッチ（NEXT_PUBLIC_SUPPORT_PLAN_A）。
 *   "on"         … /support-plan-a を開ける（今の CareNote 本番では設定しない＝出さない）
 *   "standalone" … 上に加えて、トップ（/）をこの画面へ送る（単独で公開する Vercel のプロジェクト用）
 */
export type SupportPlanAMode = "off" | "on" | "standalone";

export function supportPlanAMode(value: string | undefined): SupportPlanAMode {
  if (value === "on" || value === "standalone") return value;
  return "off";
}

/** 1章の欄のうち、画面で受け取るもの（面談の話より優先して様式に書く） */
export const BASIC_FIELDS: readonly {
  key: keyof SupportPlanABasic;
  label: string;
  example: string;
}[] = [
  { key: "age", label: "年齢", example: "28歳" },
  { key: "sex", label: "性別", example: "女性" },
  { key: "disabilityType", label: "障害種別", example: "発達障害（自閉スペクトラム症）" },
  { key: "handbook", label: "障害等級・手帳", example: "精神障害者保健福祉手帳 3級" },
  { key: "contractType", label: "契約形態", example: "雇用契約（A型）" },
  { key: "admissionDate", label: "入所年月日", example: "2024年4月" },
  { key: "attendanceHistory", label: "通所歴", example: "約2年6ヶ月" },
  { key: "workDays", label: "勤務日数", example: "週4回（月・火・木・金）" },
  { key: "workHours", label: "勤務時間", example: "10:00〜15:00（休憩1時間）" },
  { key: "hourlyWage", label: "時給", example: "1,250円" },
  { key: "monthlyWage", label: "月平均賃金", example: "約86,000円" },
];

/** 画面の入力欄の値（すべて文字。日付は YYYY-MM-DD） */
export interface SupportPlanAForm {
  /** 利用者コード（必須。例「K-014」）。氏名は書かない */
  clientCode: string;
  /** 計画番号（任意。空なら様式は手書きの空欄） */
  planNumber: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
  /** 家族が面談に同席したか */
  familyPresent: boolean;
  basic: Partial<Record<keyof SupportPlanABasic, string>>;
}

/** YYYY-MM-DD（その日の、端末の暦で） */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 計画期間の初期値: 今日から概ね6か月（短期目標の期間）。終わりは6か月後の前日 */
export function defaultPeriod(today: Date): { periodStart: string; periodEnd: string } {
  const end = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate() - 1);
  return { periodStart: isoDate(today), periodEnd: isoDate(end) };
}

/** 画面を開いたときの入力欄 */
export function emptyForm(today: Date): SupportPlanAForm {
  return {
    clientCode: "",
    planNumber: "",
    ...defaultPeriod(today),
    createdAt: isoDate(today),
    familyPresent: false,
    basic: { contractType: "雇用契約（A型）" },
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 原案を作る前に直してほしい所（空なら作ってよい）。文は画面にそのまま出す。
 * 利用者コードに氏名らしいもの（漢字・かなが3文字以上続く）を入れていたら止める ── 様式の ID化の原則。
 */
export function formProblems(form: SupportPlanAForm): string[] {
  const out: string[] = [];
  const code = form.clientCode.trim();
  if (!code) out.push("利用者コードを入れてください（例「K-014」）。氏名は書きません。");
  else if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{3,}/u.test(code))
    out.push("利用者コードに氏名のような文字があります。コード（例「K-014」）だけにしてください。");
  if (!ISO.test(form.periodStart) || !ISO.test(form.periodEnd))
    out.push("計画期間の始まりと終わりを入れてください。");
  else if (form.periodStart > form.periodEnd)
    out.push("計画期間の終わりが始まりより前になっています。");
  if (!ISO.test(form.createdAt)) out.push("作成日を入れてください。");
  return out;
}

/** 1章に書く名簿の値（空の欄は持たない ── 様式の側で面談の話・「要記入」に回す） */
export function rosterOf(form: SupportPlanAForm): Partial<SupportPlanABasic> {
  const out: Partial<SupportPlanABasic> = {};
  for (const { key } of BASIC_FIELDS) {
    const v = form.basic[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

/**
 * AI に渡す「利用者の基本情報」の文（入っている欄だけ。1つも無ければ空文字）。
 * 利用者コードは渡さない（AI は記号で足りる。表紙・様式の側で書く）。
 */
export function clientInfoOf(form: SupportPlanAForm): string {
  const roster = rosterOf(form);
  const lines = BASIC_FIELDS.filter(({ key }) => roster[key]).map(
    ({ key, label }) => `${label}: ${roster[key]}`,
  );
  if (form.familyPresent) lines.push("面談への家族の同席: あり");
  return lines.join("\n");
}

/** 様式の外の値（表紙・9章・10章・出典）。sourceLabel は「何をもとに作ったか」 */
export function metaOf(form: SupportPlanAForm, recorded: boolean): SupportPlanAMeta {
  const code = form.clientCode.trim();
  return {
    clientCode: code,
    clientLabel: "利用者",
    planNumber: form.planNumber.trim() || undefined,
    periodStart: form.periodStart,
    periodEnd: form.periodEnd,
    createdAt: form.createdAt,
    sourceLabel: recorded
      ? `面談の録音の文字起こし（${code} アセスメント面談）`
      : `面談の記録（${code} アセスメント面談）`,
    familyPresent: form.familyPresent,
  };
}
