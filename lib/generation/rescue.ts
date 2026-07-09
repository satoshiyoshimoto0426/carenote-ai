import { assessmentToText, carePlanToText } from "@/lib/draftText";
import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";
import type { SupportLogDraft } from "@/types/supportLog";
import { generateAssessment } from "./assessment";
import { generateCarePlan } from "./carePlan";
import { generateMeetingSummary } from "./meetingSummary";
import { generateMonitoring } from "./monitoring";
import { generateSupportLog } from "./supportLog";

/**
 * 救済モードの入力（人物像の構造化フォーム）。
 * 入力方法は「手打ちメモ」（吉本決定 2026-06-16・docs/SPEC.md F9）。
 * 各フィールドは介護アセスメントの観点に対応し、composePersonaNotes でラベル付きメモに合成する。
 */
export interface RescuePersona {
  /** 基本情報（年齢・性別・要介護度・世帯など）。各generatorの clientInfo に渡す */
  clientInfo?: string;
  /** 性格・人柄・コミュニケーションの特徴 */
  personality?: string;
  /** 生活歴・これまでの暮らし */
  lifeHistory?: string;
  /** 既往歴・診断・服薬 */
  medical?: string;
  /** 心身の状態（できること・できないこと・認知など） */
  physicalCognitive?: string;
  /** 家族構成・住環境 */
  familyHousing?: string;
  /** 現在利用しているサービス */
  currentServices?: string;
  /** 本人・家族の意向・希望 */
  intentions?: string;
  /** 関わりの経過・時系列（開始時期・出来事。1行1出来事の自由記述） */
  timeline?: string;
  /** その他・補足（自由記述） */
  additionalNotes?: string;
}

/** 人物像の構造化フィールド → ラベル付きメモへ合成する順序とラベル（clientInfo は別経路）。 */
const PERSONA_SECTIONS: { key: keyof RescuePersona; label: string }[] = [
  { key: "personality", label: "性格・人柄・コミュニケーション" },
  { key: "lifeHistory", label: "生活歴・これまでの暮らし" },
  { key: "medical", label: "既往歴・診断・服薬" },
  { key: "physicalCognitive", label: "心身の状態（できること・できないこと・認知）" },
  { key: "familyHousing", label: "家族構成・住環境" },
  { key: "currentServices", label: "現在利用しているサービス" },
  { key: "intentions", label: "本人・家族の意向・希望" },
  { key: "timeline", label: "関わりの経過・時系列（開始時期・出来事）" },
  { key: "additionalNotes", label: "その他・補足" },
];

/**
 * 構造化された人物像を、生成器に渡すラベル付きメモ文字列に合成する（純粋関数・テスト対象）。
 * clientInfo は generator の clientInfo に別途渡すため、ここには含めない。
 */
export function composePersonaNotes(persona: RescuePersona): string {
  return PERSONA_SECTIONS.map(({ key, label }) => {
    const value = persona[key]?.trim();
    return value ? `## ${label}\n${value}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 人物像メモの先頭に「提供書類のAI統合読解サマリ」を連結する（純粋関数・テスト対象）。
 * サマリは lib/generation/rescueIntake.generateIntake の出力（出典＝書類名付き）。
 * 手打ちとの優先順位は RESCUE_SYSTEM_OVERRIDE 側で「手打ち優先」を指示する。
 */
export function composeRescueNotes(persona: RescuePersona, intakeSummary?: string): string {
  const personaNotes = composePersonaNotes(persona);
  const summary = intakeSummary?.trim();
  if (!summary) return personaNotes;
  const intakeSection = `## 提供書類の読み取り（AIによる統合・出典付き）\n${summary}`;
  return personaNotes ? `${intakeSection}\n\n${personaNotes}` : intakeSection;
}

/** 救済モードの出力。人物像と一貫した書類一式（第6表＝給付管理は対象外）。 */
export interface RescueBundle {
  assessment: AssessmentDraft;
  carePlan: CarePlanDraft;
  meetingSummary: MeetingSummaryDraft;
  supportLog: SupportLogDraft;
  monitoring: MonitoringDraft;
}

// ---- 下流帳票の入力メモを上流出力から組み立てる純粋関数（DOM/API非依存・テスト対象） ----

/** ケアプラン用メモ＝人物像＋アセスメント結果（意向・課題分析を引き継ぐ）。 */
export function buildCarePlanNotes(personaNotes: string, assessment: AssessmentDraft): string {
  return [
    `## 利用者の人物像\n${personaNotes.trim()}`,
    `## 確定したアセスメント結果（この内容と一貫させる）\n${assessmentToText(assessment)}`,
  ].join("\n\n");
}

/** 担当者会議(第4表)用メモ＝人物像＋ケアプラン（この計画に沿った会議を想定）。 */
export function buildMeetingNotes(personaNotes: string, carePlan: CarePlanDraft): string {
  return [
    `## 利用者の人物像\n${personaNotes.trim()}`,
    `## 確定したケアプラン（このニーズ・目標・サービスに沿った担当者会議を想定して記述する）\n${carePlanToText(carePlan)}`,
  ].join("\n\n");
}

/** 支援経過(第5表)用メモ＝人物像＋ケアプラン（計画に基づく経過を想定）。 */
export function buildSupportNotes(personaNotes: string, carePlan: CarePlanDraft): string {
  return [
    `## 利用者の人物像\n${personaNotes.trim()}`,
    `## 確定したケアプラン（この計画の開始〜実施に沿った支援経過を想定して記述する）\n${carePlanToText(carePlan)}`,
  ].join("\n\n");
}

/** モニタリング用の「前回プラン要約」＝ケアプランの整形テキスト。 */
export function buildPreviousPlanSummary(carePlan: CarePlanDraft): string {
  return carePlanToText(carePlan);
}

/** モニタリング用の「最新状況メモ」＝人物像＋アセスメント全体像。 */
export function buildMonitoringNotes(personaNotes: string, assessment: AssessmentDraft): string {
  return [
    `## 利用者の人物像\n${personaNotes.trim()}`,
    `## アセスメント全体像\n${assessment.overview}`,
    "上記の人物像とプランをふまえ、計画開始から一定期間後のモニタリング時点の状況を想定して記述する。",
  ].join("\n\n");
}

/**
 * 救済モードの本体。人物像から書類一式を「依存順」に生成し、人物像・サービス・目標が
 * 全帳票で一貫するようにする。各帳票は rescue=true（完成形まで埋める）で生成する。
 *
 * 依存と並列化:
 *   アセス → ケアプラン（アセス結果を引き継ぐ）→ {会議・経過・モニタリング}（ケアプラン確定後は
 *   互いに独立なので並列実行）。Opus×5回ぶんの所要時間を抑えるための構成。
 *
 * @param intakeSummary 提供書類(PDF)のAI統合読解サマリ（rescueIntake.generateIntake の出力）。
 *   与えられた場合は人物像メモの先頭に連結し、全帳票の入力に含める（Stage0→統合）。
 */
export async function generateRescueBundle(
  persona: RescuePersona,
  intakeSummary?: string,
): Promise<RescueBundle> {
  const opts = { rescue: true };
  const clientInfo = persona.clientInfo?.trim() || undefined;
  const personaNotes = composeRescueNotes(persona, intakeSummary);

  const assessment = await generateAssessment({ clientInfo, assessmentNotes: personaNotes }, opts);

  const carePlan = await generateCarePlan(
    { clientInfo, assessmentNotes: buildCarePlanNotes(personaNotes, assessment) },
    opts,
  );

  const [meetingSummary, supportLog, monitoring] = await Promise.all([
    generateMeetingSummary(
      { clientInfo, meetingNotes: buildMeetingNotes(personaNotes, carePlan) },
      opts,
    ),
    generateSupportLog(
      { clientInfo, supportNotes: buildSupportNotes(personaNotes, carePlan) },
      opts,
    ),
    generateMonitoring(
      {
        clientInfo,
        previousPlanSummary: buildPreviousPlanSummary(carePlan),
        monitoringNotes: buildMonitoringNotes(personaNotes, assessment),
      },
      opts,
    ),
  ]);

  return { assessment, carePlan, meetingSummary, supportLog, monitoring };
}
