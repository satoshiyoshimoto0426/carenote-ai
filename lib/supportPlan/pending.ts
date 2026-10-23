import { SUPPORT_PLAN_A_CHAPTERS, type SupportPlanAView } from "./format";

/**
 * 様式に描く値（SupportPlanAView）の中から、「要記入」が残っている欄を章の順に拾う。純粋な関数。
 *
 * なぜあるか: 原案の画面（components/supportPlan/SupportPlanAWorkbench.tsx）の右に「要記入」の一覧を出し、
 *   サービス管理責任者が何を書き足せば仕上がるかを、印刷用ページ（iframe）をめくらずに見られるようにする。
 *   面談で話に出なかった欄と、もともと手書きにする欄（生年月日・担当者・次回の見直しの日など）の両方が並ぶ。
 * 決まり: 「（要記入）」「／要記入」など、値の文字に「要記入」を含む欄だけを拾う（「要確認」は拾わない ──
 *   それは原案の itemsToConfirm と関係機関の欄が受け持つ）。表紙は拾わない（同じ値を1章が持つ）。
 * 何と繋がるか: 値の組み立て＝lib/supportPlan/format.ts の buildSupportPlanAView（「要記入」の書き方の正本は TBD）。
 */

/** 「要記入」が残っている欄1つ */
export interface PendingField {
  /** 様式の章（例「1. 基本情報」） */
  chapter: string;
  /** 欄の名前（例「生年月日」「短期目標① 支援内容」） */
  label: string;
}

const MARK = "要記入";

const has = (value: string | readonly string[]) =>
  typeof value === "string" ? value.includes(MARK) : value.some((v) => v.includes(MARK));

/** 「■ 短期目標①：…」→「短期目標①」 */
function goalName(heading: string): string {
  return heading.replace(/^■\s*/, "").split("：")[0];
}

/** 様式の値から「要記入」が残っている欄を、様式の章の順に返す */
export function pendingFields(view: SupportPlanAView): PendingField[] {
  const ch = (n: number) => SUPPORT_PLAN_A_CHAPTERS[n - 1];
  const out: PendingField[] = [];
  const add = (n: number, label: string) => out.push({ chapter: ch(n), label });

  for (const [l1, v1, l2, v2] of view.basic.rows) {
    if (has(v1)) add(1, l1);
    if (has(v2)) add(1, l2);
  }
  for (const [label, value] of view.intentions) if (has(value)) add(2, label);
  for (const group of view.needs) {
    if (group.rows.some((r) => has(r.issue) || has(r.direction))) add(3, group.title);
  }
  for (const [label, value] of view.policy) if (has(value)) add(4, label);
  for (const [label, value] of view.longTerm) if (has(value)) add(5, label);
  for (const goal of view.shortTerms) {
    const name = goalName(goal.heading);
    if (has(goal.heading)) add(6, `${name} 目標の名前`);
    for (const [label, value] of goal.rows) if (has(value)) add(6, `${name} ${label}`);
  }
  for (const { label, lines } of view.service) if (has(lines)) add(7, label);
  for (const { label, lines } of view.liaison) if (has(lines)) add(8, label);
  if (has(view.monitoring.timing)) add(9, "モニタリングの時期");
  if (has(view.monitoring.criteria)) add(9, "評価の基準");
  for (const { label, lines } of view.consent) if (has(lines)) add(10, label);
  return out;
}

/** 画面で章ごとにまとめて見せるための形（章の順はそのまま。同じ章の欄は1つにまとめる） */
export function groupPendingByChapter(
  fields: readonly PendingField[],
): { chapter: string; labels: string[] }[] {
  const groups: { chapter: string; labels: string[] }[] = [];
  for (const { chapter, label } of fields) {
    const last = groups[groups.length - 1];
    if (last?.chapter === chapter) last.labels.push(label);
    else groups.push({ chapter, labels: [label] });
  }
  return groups;
}
