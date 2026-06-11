import type { AssessmentDraft } from "@/types/assessment";
import type { CarePlanDraft } from "@/types/carePlan";
import type { MeetingSummaryDraft } from "@/types/meetingSummary";
import type { MonitoringDraft } from "@/types/monitoring";

/** 共通: 要確認事項のブロックを追記する */
function pushItemsToConfirm(lines: string[], items: string[]): void {
  if (items.length === 0) return;
  lines.push("");
  lines.push("【要確認事項】");
  for (const item of items) {
    lines.push(`・${item}`);
  }
}

/** ケアプラン下書きを、確認・コピーしやすいプレーンテキストに整形する */
export function carePlanToText(d: CarePlanDraft): string {
  const lines: string[] = [];
  lines.push(`利用者名: ${d.clientName}`);
  lines.push("");
  lines.push(`【利用者及び家族の意向】\n${d.intentions}`);
  lines.push("");
  lines.push(`【意向を踏まえた課題分析の結果】\n${d.assessmentSummary}`);
  lines.push("");
  lines.push(`【総合的な援助の方針】\n${d.comprehensivePolicy}`);
  lines.push("");
  lines.push("【生活全般の解決すべき課題（ニーズ）】");
  d.needs.forEach((n, i) => {
    lines.push(`${i + 1}. ${n.need}`);
    lines.push(`   長期目標: ${n.longTermGoal}（${n.longTermPeriod}）`);
    lines.push(`   短期目標: ${n.shortTermGoal}（${n.shortTermPeriod}）`);
    for (const s of n.services) {
      lines.push(
        `   - ${s.content} / ${s.serviceType} / ${s.frequency} / ${s.period} / 担当: ${s.provider}`,
      );
    }
  });
  pushItemsToConfirm(lines, d.itemsToConfirm);
  return lines.join("\n");
}

/** アセスメント下書きを、確認・コピーしやすいプレーンテキストに整形する */
export function assessmentToText(d: AssessmentDraft): string {
  const lines: string[] = [];
  lines.push(`利用者名: ${d.clientName}`);
  lines.push("");
  lines.push(`【今回のアセスメントの理由】\n${d.assessmentReason}`);
  lines.push("");
  lines.push(`【主訴・意向】\n${d.mainComplaints}`);
  lines.push("");
  lines.push(`【これまでの生活と現在の状況（生活歴）】\n${d.lifeHistory}`);
  lines.push("");
  lines.push(`【現在利用している支援・社会資源】\n${d.currentServices}`);
  lines.push("");
  lines.push(`【全体像】\n${d.overview}`);
  lines.push("");
  lines.push("【課題分析14項目（標準項目準拠）】");
  for (const dom of d.domains) {
    lines.push(`■ ${dom.domain}`);
    lines.push(`  現状: ${dom.currentStatus}`);
    lines.push(`  分析: ${dom.analysis}`);
  }
  if (d.strengths.length > 0) {
    lines.push("");
    lines.push("【強み（ストレングス）】");
    for (const s of d.strengths) {
      lines.push(`・${s}`);
    }
  }
  lines.push("");
  lines.push("【抽出された生活課題の候補】");
  d.identifiedIssues.forEach((issue, i) => {
    lines.push(`${i + 1}. ${issue}`);
  });
  pushItemsToConfirm(lines, d.itemsToConfirm);
  return lines.join("\n");
}

/** 第4表（サービス担当者会議の要点）下書きを、確認・コピーしやすいプレーンテキストに整形する */
export function meetingSummaryToText(d: MeetingSummaryDraft): string {
  const lines: string[] = [];
  lines.push(`利用者名: ${d.clientName}`);
  lines.push(`開催日: ${d.meetingDate} / 場所: ${d.meetingPlace} / 時間: ${d.meetingTime}`);
  lines.push("");
  lines.push("【会議出席者】");
  for (const a of d.attendees) {
    lines.push(`・${a.affiliation}（${a.role}） ${a.name}`);
  }
  lines.push("");
  lines.push("【検討した項目・検討内容】");
  d.discussions.forEach((disc, i) => {
    lines.push(`${i + 1}. ${disc.item}`);
    lines.push(`   ${disc.details}`);
  });
  lines.push("");
  lines.push(`【結論】\n${d.conclusion}`);
  lines.push("");
  lines.push(`【残された課題（次回の開催時期）】\n${d.remainingIssues}`);
  pushItemsToConfirm(lines, d.itemsToConfirm);
  return lines.join("\n");
}

/** モニタリング下書きを、確認・コピーしやすいプレーンテキストに整形する */
export function monitoringToText(d: MonitoringDraft): string {
  const lines: string[] = [];
  lines.push(`利用者名: ${d.clientName}`);
  lines.push("");
  lines.push(`【総合所見】\n${d.overallSummary}`);
  lines.push("");
  lines.push("【目標ごとの達成状況】");
  d.goalEvaluations.forEach((g, i) => {
    lines.push(`${i + 1}. ${g.goal}`);
    lines.push(`   達成状況: ${g.achievement}`);
    lines.push(`   根拠: ${g.evidence}`);
    lines.push(`   提案: ${g.proposal}`);
  });
  lines.push("");
  lines.push(`【プラン全体の判断】\n${d.planRecommendation}`);
  pushItemsToConfirm(lines, d.itemsToConfirm);
  return lines.join("\n");
}
