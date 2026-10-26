import { describe, expect, it } from "vitest";
import { SUPPORT_PLAN_A_RULES } from "@/lib/rules/supportPlanA";
import { emptyDraft } from "@/lib/supportPlan/testFixtures";
import { SUPPORT_PLAN_A_JSON_SCHEMA } from "./supportPlanA";
import { buildSupportPlanAUserMessage, SUPPORT_PLAN_A_SYSTEM_PROMPT } from "./supportPlanAPrompt";

/**
 * 就労A型の個別支援計画書（原案）を作る AI への指示と、返す形の決まり。
 * 守ること: 創作しない（空文字→要記入）・サビ管の補助という役割・介護保険の言葉を持ち込まない・
 *   返す形が型（types/supportPlanA.ts）と食い違わない。
 */
describe("SUPPORT_PLAN_A_SYSTEM_PROMPT", () => {
  it("品質ルールを入れている", () => {
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).toContain(SUPPORT_PLAN_A_RULES);
  });

  it("役割はサービス管理責任者の補助で、ケアマネの補助ではない", () => {
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).toContain("サービス管理責任者（サビ管）を補助するAI");
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).not.toContain("ケアマネジャー");
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).not.toContain("介護支援専門員");
  });

  it("話に出なかった所を創作せず空文字にし、確かめる点を itemsToConfirm に挙げる指示がある", () => {
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).toContain("創作せず空文字");
    expect(SUPPORT_PLAN_A_SYSTEM_PROMPT).toContain("itemsToConfirm");
  });

  it("国の基準の記載事項・本人の言葉・A型の言葉（賃金。工賃ではない）をルールに持つ", () => {
    for (const phrase of [
      "利用者及びその家族の生活に対する意向",
      "総合的な支援の方針",
      "生活全般の質を向上させるための課題",
      "「」でできるだけそのまま",
      "「工賃」は使いません",
      "人の名前は書きません",
      "計画の決めごとなので、空にせず書きます",
    ]) {
      expect(SUPPORT_PLAN_A_RULES).toContain(phrase);
    }
  });
});

describe("buildSupportPlanAUserMessage", () => {
  it("面談の文字起こしを見出しつきで入れる", () => {
    const msg = buildSupportPlanAUserMessage({ interviewNotes: "  ラベル貼りは得意です。  " });
    expect(msg).toContain("## アセスメント面談の文字起こし・メモ\nラベル貼りは得意です。");
    expect(msg).not.toContain("## 利用者の基本情報");
  });

  it("名簿の基本情報があれば見出しつきで入れる", () => {
    const msg = buildSupportPlanAUserMessage({
      clientInfo: "28歳 女性 雇用契約（A型）",
      interviewNotes: "話した内容",
    });
    expect(msg).toContain("## 利用者の基本情報（名簿から）\n28歳 女性 雇用契約（A型）");
  });
});

/** JSON の決まりの object を、上から順にすべて集める */
function objects(schema: unknown, path = "$"): { path: string; node: Record<string, unknown> }[] {
  if (typeof schema !== "object" || schema === null) return [];
  const node = schema as Record<string, unknown>;
  const out: { path: string; node: Record<string, unknown> }[] = [];
  if (node.type === "object") out.push({ path, node });
  const props = (node.properties ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(props)) out.push(...objects(v, `${path}.${k}`));
  if (node.items) out.push(...objects(node.items, `${path}[]`));
  return out;
}

/** 値の形（object の欄の名前）を、入れ子も含めて並べる */
function shape(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) return value.length > 0 ? shape(value[0], `${path}[]`) : [];
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([k, v]) => [`${path}.${k}`, ...shape(v, `${path}.${k}`)]);
}

describe("SUPPORT_PLAN_A_JSON_SCHEMA", () => {
  it("すべての object で、全部の欄が必須で、余分な欄を許さない（構造化出力の決まり）", () => {
    const all = objects(SUPPORT_PLAN_A_JSON_SCHEMA);
    expect(all.length).toBeGreaterThan(5);
    for (const { path, node } of all) {
      expect(node.additionalProperties, path).toBe(false);
      expect([...((node.required as string[]) ?? [])].sort(), path).toEqual(
        Object.keys((node.properties as object) ?? {}).sort(),
      );
    }
  });

  it("返す形の欄の名前が、型（SupportPlanADraft）と一致する（片方だけ変えると落ちる）", () => {
    const fromSchema = new Set(
      objects(SUPPORT_PLAN_A_JSON_SCHEMA).flatMap(({ path, node }) =>
        Object.keys((node.properties as object) ?? {}).map((k) => `${path}.${k}`),
      ),
    );
    const draft = emptyDraft();
    // 配列の中の形は空の原案では見えないので、1件ずつ入れてから比べる
    draft.needs.work = [{ issue: "", direction: "" }];
    draft.needs.social = [{ issue: "", direction: "" }];
    draft.needs.health = [{ issue: "", direction: "" }];
    draft.shortTerms = [{ title: "", detail: "", support: "", method: "", staffRole: "" }];
    expect(new Set(shape(draft))).toEqual(fromSchema);
  });
});
