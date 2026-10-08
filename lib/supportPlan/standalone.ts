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
 *   画面を出すかどうかの印（NEXT_PUBLIC_SUPPORT_PLAN_A）は lib/supportPlan/edition.ts。
 */

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
  /** 利用者コード（必須。例「K-014」）。英数字とハイフンだけ・20字まで。氏名は書かない */
  clientCode: string;
  /** 表紙の呼び名（任意。空なら「利用者」＋利用者コードの先頭の英字 ── defaultClientLabel） */
  clientLabel: string;
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

/**
 * 計画期間の初期値: 来月1日から6か月（短期目標の期間）。終わりは6か月後の前日（＝月末）。
 * 面談の月の翌月から計画を始めることが多いため（例: 10/3 の面談 → 11/1〜翌4/30）。画面で直せる。
 */
export function defaultPeriod(today: Date): { periodStart: string; periodEnd: string } {
  const start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  // 0日 ＝ 前の月の末日。始まりの月から数えて6か月目の末日になる
  const end = new Date(today.getFullYear(), today.getMonth() + 7, 0);
  return { periodStart: isoDate(start), periodEnd: isoDate(end) };
}

/** 利用者コードの決まり: 英数字とハイフンだけ・20字まで（氏名を入れさせない ── 様式の ID化の原則） */
const CLIENT_CODE = /^[A-Za-z0-9-]{1,20}$/;

/** 表紙の呼び名の長さの上限 */
const CLIENT_LABEL_MAX = 20;

/**
 * 画面で入れた利用者コードを、様式に書く形にそろえる。
 * 全角の英数字・ハイフン（「Ｋ－０１４」）は半角（「K-014」）に直す（日本語入力のままでも打てるように）。前後の空白は除く。
 */
export function normalizeClientCode(raw: string): string {
  return raw.normalize("NFKC").trim();
}

/** 表紙の呼び名の既定: 「利用者」＋利用者コードの先頭の英字（大文字）。英字が無ければ「利用者」だけ */
export function defaultClientLabel(clientCode: string): string {
  const letter = /[A-Za-z]/.exec(normalizeClientCode(clientCode))?.[0];
  return letter ? `利用者${letter.toUpperCase()}` : "利用者";
}

/** 画面を開いたときの入力欄 */
export function emptyForm(today: Date): SupportPlanAForm {
  return {
    clientCode: "",
    clientLabel: "",
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
 * 利用者コードは英数字とハイフンだけ・20字まで（漢字・かな・空白が入れば止める ── 氏名を入れさせない。様式の ID化の原則）。
 */
export function formProblems(form: SupportPlanAForm): string[] {
  const out: string[] = [];
  const code = normalizeClientCode(form.clientCode);
  if (!code) out.push("利用者コードを入れてください（例「K-014」）。氏名は書きません。");
  else if (!CLIENT_CODE.test(code))
    out.push(
      "利用者コードは英数字とハイフン（-）だけ、20字までで入れてください（例「K-014」）。氏名は書きません。",
    );
  if (form.clientLabel.trim().length > CLIENT_LABEL_MAX)
    out.push(`表紙の呼び名は${CLIENT_LABEL_MAX}字までにしてください（例「利用者K」）。`);
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

/**
 * 基本情報の欄（契約形態の既定値は除く）に、1つでも入れたか。
 * 面談の進め方の「1. 基本情報」の目安に使う（lib/supportPlan/coverage.ts の topicCoverage の basicEntered）。
 */
export function hasBasicInput(form: SupportPlanAForm): boolean {
  return BASIC_FIELDS.some(
    ({ key }) => key !== "contractType" && (form.basic[key]?.trim() ?? "") !== "",
  );
}

/** 様式の外の値（表紙・9章・10章・出典）。sourceLabel は「何をもとに作ったか」 */
export function metaOf(form: SupportPlanAForm, recorded: boolean): SupportPlanAMeta {
  const code = normalizeClientCode(form.clientCode);
  return {
    clientCode: code,
    clientLabel: form.clientLabel.trim() || defaultClientLabel(code),
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
