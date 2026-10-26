import type {
  SupportPlanABasic,
  SupportPlanADraft,
  SupportPlanALiaison,
  SupportPlanANeed,
} from "@/types/supportPlanA";

/**
 * 就労A型の個別支援計画書を、事業所の様式（10章立て）の各欄の文字に組み立てる純粋な関数。
 *
 * なぜあるか: 様式の章・欄の名前・空欄の書き方（「要記入」「＿＿」）を1か所で決め、描画
 *   （components/supportPlan/SupportPlanDocument.tsx）と試験から同じ値を使うため。
 * 決まり:
 *   - 1章は名簿の値を優先し、無ければ原案の値、それも無ければ「（要記入）」。
 *   - 氏名・受給者証番号は、値を受け取らず常に「（対応表で管理）」と書く（様式の ID化の原則）。
 *   - 評価の時期・次回の見直しは、計画期間の終わりの月から組み立てる（AI に書かせない）。
 * 何と繋がるか: 原案の型＝types/supportPlanA.ts。章の名前の正本は下の SUPPORT_PLAN_A_CHAPTERS。
 */

/** 空の欄に書く文字 */
export const TBD = "（要記入）";

/** 様式の章の見出し（一字一句、事業所の様式どおり） */
export const SUPPORT_PLAN_A_CHAPTERS = [
  "1. 基本情報",
  "2. 利用者及び家族の意向",
  "3. 課題・ニーズの整理",
  "4. 総合的な援助方針",
  "5. 長期目標",
  "6. 短期目標と支援内容",
  "7. サービスの内容及び支援の体制",
  "8. 関係機関との連携",
  "9. モニタリングの時期・方法",
  "10. 同意・署名",
] as const;

/** 章の下の説明の帯（様式どおり。帯の無い章は持たない） */
export const SUPPORT_PLAN_A_INTROS: Partial<Record<number, string>> = {
  2: "アセスメント面談・定期面談で聴き取った本人（および家族）の意向を、本人の言葉をできるだけそのまま記載する。",
  3: "アセスメントシートの結果をもとに、支援すべき課題と本人のニーズを整理する。",
  4: "アセスメント結果と本人・家族の意向を踏まえ、当該計画期間における総合的な援助方針を記載する。",
  5: "就労継続支援A型事業所における長期的な目標を記載する。概ね1〜3年先を見据える。",
  6: "長期目標を達成するための短期目標（概ね6ヶ月）を設定し、各目標について支援内容・方法・評価時期を記載する。",
  8: "本人の支援に関わる関係機関との連携内容を記載する。※該当時のみ記載。",
};

/** 様式の外から決まる値（名簿・画面の入力・計画期間） */
export interface SupportPlanAMeta {
  /** 利用者コード（例「K-014」） */
  clientCode: string;
  /** 表紙の利用者の呼び名（例「利用者K」） */
  clientLabel: string;
  /** 計画番号（分からなければ undefined ＝ 手書きの空欄） */
  planNumber?: string;
  /** 計画期間の始まり（YYYY-MM-DD） */
  periodStart: string;
  /** 計画期間の終わり（YYYY-MM-DD）。評価の時期・次回の見直しの月になる */
  periodEnd: string;
  /** 作成日（YYYY-MM-DD） */
  createdAt: string;
  /** 何をもとに作ったか（例「面談の録音の文字起こし（K-014 アセスメント面談）」） */
  sourceLabel: string;
  /** 家族が面談に同席したか */
  familyPresent: boolean;
}

export type Pair = readonly [label: string, value: string];
export type Quad = readonly [label1: string, value1: string, label2: string, value2: string];

/** 様式に描く値のまとまり（描画の部品はこれだけを見る） */
export interface SupportPlanAView {
  cover: { kind: string; title: string; who: string; rows: Pair[]; foot: string[] };
  basic: { rows: Quad[]; note: string };
  intentions: Pair[];
  /** 3章の表。key は表の中で行を見分ける番号（同じ文の行が2つあっても描画で落とさないため） */
  needs: { title: string; rows: (SupportPlanANeed & { key: string })[] }[];
  policy: Pair[];
  longTerm: Pair[];
  shortTerms: { heading: string; rows: Pair[] }[];
  service: { label: string; lines: string[] }[];
  liaison: { label: string; lines: string[] }[];
  monitoring: { timing: string; methods: string[]; criteria: string; note: string };
  consent: { label: string; lines: string[] }[];
  source: string;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
const LINE = "＿＿＿＿＿＿＿＿";

/** 空文字・空白だけなら TBD */
function orTbd(value: string | undefined): string {
  const v = value?.trim();
  return v ? v : TBD;
}

/** YYYY-MM-DD → 「2026年10月1日」（形が違えばそのまま返す） */
export function jaDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : iso;
}

/** YYYY-MM-DD → 「2027年3月」 */
export function jaMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(iso);
  return m ? `${Number(m[1])}年${Number(m[2])}月` : iso;
}

function checks(status: SupportPlanALiaison["status"]): string {
  if (status === "あり") return "☑連携あり　□なし";
  if (status === "なし") return "□連携あり　☑なし";
  return "□連携あり　□なし（要確認）";
}

/** 原案（AI）・名簿・様式の外の値から、様式に描く値を組み立てる */
export function buildSupportPlanAView(
  draft: SupportPlanADraft,
  meta: SupportPlanAMeta,
  roster: Partial<SupportPlanABasic> = {},
): SupportPlanAView {
  const basic = (key: keyof SupportPlanABasic) => orTbd(roster[key]?.trim() || draft.basic[key]);
  const planNo = meta.planNumber?.trim() ? `第${meta.planNumber.trim()}号` : "第＿＿号";
  const endMonth = jaMonth(meta.periodEnd);
  const evaluation = `${endMonth}にモニタリング面談にて評価\n（達成度5段階：□1.目標に届かない　□2.やや届かない　□3.概ね達成\n□4.達成　□5.上回る達成）`;

  const needGroup = (title: string, rows: SupportPlanANeed[]) => ({
    title,
    rows:
      rows.filter((r) => r.issue.trim() || r.direction.trim()).length > 0
        ? rows.map((r, i) => ({
            key: `${title}-${i + 1}`,
            issue: orTbd(r.issue),
            direction: orTbd(r.direction),
          }))
        : [{ key: `${title}-1`, issue: TBD, direction: TBD }],
  });

  const goals =
    draft.shortTerms.length > 0
      ? draft.shortTerms.map((g, i) => ({
          heading: `■ 短期目標${CIRCLED[i] ?? `(${i + 1})`}：${orTbd(g.title)}`,
          rows: [
            ["目標の具体的内容", orTbd(g.detail)],
            ["支援内容", orTbd(g.support)],
            ["支援方法・配慮事項", orTbd(g.method)],
            ["評価の時期・方法", evaluation],
            [
              "担当者",
              g.staffRole.trim()
                ? `支援担当者（${g.staffRole.trim()}／要記入）`
                : "支援担当者（要記入）",
            ],
          ] as Pair[],
        }))
      : [
          {
            heading: `■ 短期目標①：${TBD}`,
            rows: [
              ["目標の具体的内容", TBD],
              ["支援内容", TBD],
              ["支援方法・配慮事項", TBD],
              ["評価の時期・方法", evaluation],
              ["担当者", "支援担当者（要記入）"],
            ] as Pair[],
          },
        ];

  const familyIntention = draft.intentions.family.trim()
    ? draft.intentions.family.trim()
    : meta.familyPresent
      ? TBD
      : "（要確認：今回の面談は家族の同席なし。次回の面談時に聴取）";

  return {
    cover: {
      kind: "就労継続支援A型事業所",
      title: "個別支援計画書",
      who: `${meta.clientLabel}（${meta.clientCode}）／原案`,
      rows: [
        ["利用者コード", meta.clientCode],
        ["計画番号", planNo],
        ["計画期間", `${jaDate(meta.periodStart)} 〜 ${jaDate(meta.periodEnd)}`],
        ["作成日", jaDate(meta.createdAt)],
        ["作成者", "＿＿＿＿＿＿（サビ管）"],
      ],
      foot: [
        `${meta.sourceLabel}をもとに作成した原案です。`,
        "最終的な確認・修正はサービス管理責任者（サビ管）が行うことを前提としています。",
        `${jaDate(meta.createdAt)} 作成`,
      ],
    },
    basic: {
      rows: [
        [
          "利用者コード",
          meta.clientCode,
          "計画番号",
          meta.planNumber?.trim() ? planNo : "第＿＿号（要記入）",
        ],
        ["氏名（※対応表で管理）", "（対応表で管理）", "生年月日", "＿＿年＿＿月＿＿日（要記入）"],
        ["年齢", basic("age"), "性別", basic("sex")],
        ["障害種別", basic("disabilityType"), "障害等級・手帳", basic("handbook")],
        ["受給者証番号", "（対応表で管理）", "契約形態", basic("contractType")],
        ["入所年月日", basic("admissionDate"), "通所歴", basic("attendanceHistory")],
        ["勤務日数", basic("workDays"), "勤務時間", basic("workHours")],
        ["時給", basic("hourlyWage"), "月平均賃金", basic("monthlyWage")],
      ],
      note: "※氏名・受給者証番号は対応表で管理し、本書類には利用者コードのみ記載する（ID化の原則）。",
    },
    intentions: [
      ["就労に関する希望・意向", orTbd(draft.intentions.work)],
      ["生活に関する希望・意向", orTbd(draft.intentions.life)],
      ["その他の希望・意向", orTbd(draft.intentions.other)],
      ["家族の意向（※同席時）", familyIntention],
    ],
    needs: [
      needGroup("3-1. 作業面の課題・ニーズ", draft.needs.work),
      needGroup("3-2. 心理・社会参加面の課題・ニーズ", draft.needs.social),
      needGroup("3-3. 健康面の課題・ニーズ", draft.needs.health),
    ],
    policy: [["総合的な援助方針", orTbd(draft.policy)]],
    longTerm: [
      ["長期目標", orTbd(draft.longTerm.goal)],
      ["目標達成の目安", orTbd(draft.longTerm.target)],
      ["長期目標の背景・根拠", orTbd(draft.longTerm.rationale)],
    ],
    shortTerms: goals,
    service: [
      { label: "サービスの種類", lines: ["就労継続支援A型"] },
      { label: "提供するサービス内容", lines: [orTbd(draft.service.content)] },
      {
        label: "支援の体制",
        lines: [
          `・サービス管理責任者：${LINE}（要記入）`,
          `・支援担当者：${LINE}（要記入）`,
          `・その他の関わり職員：${draft.service.otherStaff.trim() || `${LINE}（要記入）`}`,
        ],
      },
      { label: "勤務・作業の配慮", lines: [orTbd(draft.service.workCare)] },
      { label: "健康面の配慮", lines: [orTbd(draft.service.healthCare)] },
      { label: "環境・設備の配慮", lines: [orTbd(draft.service.envCare)] },
    ],
    liaison: [
      {
        label: "相談支援専門員",
        lines: [
          checks(draft.liaison.counselor.status),
          `氏名：${draft.liaison.counselor.name.trim() || LINE}　連携内容：${draft.liaison.counselor.content.trim() || LINE}`,
        ],
      },
      {
        label: "主治医・医療機関",
        lines: [
          checks(draft.liaison.medical.status),
          `医療機関名：${draft.liaison.medical.name.trim() || LINE}　連携内容：${draft.liaison.medical.content.trim() || LINE}`,
        ],
      },
      {
        label: "家族",
        lines: [
          checks(draft.liaison.family.status),
          `連携内容：${draft.liaison.family.content.trim() || LINE}`,
        ],
      },
      { label: "その他の関係機関", lines: [draft.liaison.others.trim() || "（要確認）"] },
    ],
    monitoring: {
      timing: `概ね6ヶ月ごと（次回：${endMonth}＿＿日／要記入）`,
      methods: [
        "本人面談（サビ管が実施）",
        "支援記録の蓄積・振り返り",
        "関係機関・家族からの情報収集（※該当時）",
        "目標別達成度評価（5段階評価）",
      ],
      criteria: orTbd(draft.reviewCriteria),
      note: "モニタリング結果は「個別支援記録表」に記録し、計画の見直し・次期計画の作成に活かす。",
    },
    consent: [
      { label: "計画作成者", lines: [`${LINE}（サビ管）`] },
      { label: "作成日", lines: [jaDate(meta.createdAt)] },
      {
        label: "本人の同意",
        lines: [`□同意しました（署名：${LINE}）`, `□同意いただけなかった（理由：${LINE}＿＿＿＿）`],
      },
      {
        label: "家族の同意（※同席時）",
        lines: [
          `□同意しました（署名：${LINE}）`,
          `□同意いただけなかった（理由：${LINE}＿＿＿＿）`,
          meta.familyPresent ? "□同席なし" : "☑同席なし",
        ],
      },
      { label: "次回見直し予定日", lines: [`${endMonth}＿＿日（要記入）`] },
    ],
    source: `出典：記載項目は障害福祉サービス運営基準（個別支援計画の作成義務）に基づく。本原案は${meta.sourceLabel}をもとにAIが作成したものです。記録に情報がない項目は「要記入」として明示しています。最終的な確認・修正はサービス管理責任者（サビ管）が行うことが前提です。`,
  };
}
