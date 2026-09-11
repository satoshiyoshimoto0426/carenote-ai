import { describe, expect, it } from "vitest";
// 第5表本文の書式は lib 側が正本。アダプタの同等実装（UMD・素のJSで import 不可）との
// 整合をこのテストで担保する（docs/KAIPOKE-DOM.md 追加マッピング方針）。
import { supportLogToText } from "@/lib/draftText";
import type { SupportLogDraft } from "@/types/supportLog";
// UMD ラッパ経由で純粋ロジックのみ読み込む（DOM依存関数は呼ばない）。
import adapter from "./kaipoke.js";

describe("CareNoteKaipoke 文字幅・行数計測", () => {
  it("charWidth: 半角=0.5 / 全角=1", () => {
    expect(adapter.charWidth("a")).toBe(0.5);
    expect(adapter.charWidth("1")).toBe(0.5);
    expect(adapter.charWidth("ｶ")).toBe(0.5); // 半角カナ
    expect(adapter.charWidth("あ")).toBe(1);
    expect(adapter.charWidth("漢")).toBe(1);
    expect(adapter.charWidth("　")).toBe(1); // 全角スペース
  });

  it("lineFullWidth: 全角換算で切り上げ", () => {
    expect(adapter.lineFullWidth("あいう")).toBe(3);
    expect(adapter.lineFullWidth("abcd")).toBe(2); // 0.5*4
    expect(adapter.lineFullWidth("あa")).toBe(2); // 1 + 0.5 -> ceil(1.5)=2
  });

  it("measureText: 行数・桁数の超過を警告する（止めはしない）", () => {
    const mapping = {
      key: "overview",
      label: "まとめ",
      names: [],
      maxRows: 2,
      maxColsFullWidth: 5,
    };
    // 2行×5字の欄。総文字数の安全上限は 行×字−行数=8 なので、改行込み9字ではなく7字で「収まる」を確かめる
    const ok = adapter.measureText("あいう\nかきく", mapping);
    expect(ok.rows).toBe(2);
    expect(ok.overRows).toBe(false);
    expect(ok.overCols).toBe(false);
    expect(ok.warnings).toHaveLength(0);

    const over = adapter.measureText("あいうえおか\n2行目\n3行目", mapping);
    expect(over.rows).toBe(3);
    expect(over.overRows).toBe(true); // 3 > 2
    expect(over.overCols).toBe(true); // 6 > 5
    expect(over.overTotal).toBe(true); // 13字 > 安全上限8字
    expect(over.warnings.length).toBe(3);
  });
});

describe("CareNoteKaipoke 日付解析（parseJapaneseDate）", () => {
  it("YYYY-MM-DD: 西暦→和暦に変換する", () => {
    expect(adapter.parseJapaneseDate("2026-07-10")).toEqual({
      era: "令和",
      eraYear: 8,
      month: 7,
      day: 10,
    });
  });

  it("YYYY/M/D: ゼロ詰めなしも解析する", () => {
    expect(adapter.parseJapaneseDate("2026/7/3")).toEqual({
      era: "令和",
      eraYear: 8,
      month: 7,
      day: 3,
    });
  });

  it("M/D（年なし）: era/eraYear は null（年セレクトは触らない）", () => {
    expect(adapter.parseJapaneseDate("7/10")).toEqual({
      era: null,
      eraYear: null,
      month: 7,
      day: 10,
    });
  });

  it("令和N年M月D日・元年表記", () => {
    expect(adapter.parseJapaneseDate("令和8年7月10日")).toEqual({
      era: "令和",
      eraYear: 8,
      month: 7,
      day: 10,
    });
    expect(adapter.parseJapaneseDate("令和元年5月1日")).toEqual({
      era: "令和",
      eraYear: 1,
      month: 5,
      day: 1,
    });
  });

  it("日付の後ろに時刻等が続いても日付部分を解析する", () => {
    expect(adapter.parseJapaneseDate("2026-07-10 14:00ごろ")).toEqual({
      era: "令和",
      eraYear: 8,
      month: 7,
      day: 10,
    });
  });

  it("改元境界: 2019年4月は平成31年", () => {
    expect(adapter.parseJapaneseDate("2019-04-30")).toEqual({
      era: "平成",
      eraYear: 31,
      month: 4,
      day: 30,
    });
    expect(adapter.parseJapaneseDate("2019-05-01")).toEqual({
      era: "令和",
      eraYear: 1,
      month: 5,
      day: 1,
    });
  });

  it("解析不能・不正値は null（相対表現は日付スキップ対象）", () => {
    expect(adapter.parseJapaneseDate("初回訪問時")).toBeNull();
    expect(adapter.parseJapaneseDate("要確認")).toBeNull();
    expect(adapter.parseJapaneseDate("")).toBeNull();
    expect(adapter.parseJapaneseDate("2026-13-01")).toBeNull(); // 月が不正
    expect(adapter.parseJapaneseDate("2026-12-32")).toBeNull(); // 日が不正
  });
});

describe("CareNoteKaipoke 流し込み対象の選定", () => {
  it("INJECTABLE_TYPES は5帳票（assessment/carePlan/meetingSummary/supportLog/monitoring）", () => {
    expect(adapter.INJECTABLE_TYPES).toContain("assessment");
    expect(adapter.INJECTABLE_TYPES).toContain("carePlan");
    expect(adapter.INJECTABLE_TYPES).toContain("meetingSummary");
    expect(adapter.INJECTABLE_TYPES).toContain("supportLog");
    expect(adapter.INJECTABLE_TYPES).toContain("monitoring");
  });

  it("assessment: 値のある欄のみ・主訴は caution フラグ", () => {
    const draft = {
      clientName: "要確認",
      mainComplaints: "本人: 家で過ごしたい。",
      lifeHistory: "",
      overview: "全体として在宅継続が可能。",
    };
    const fields = adapter.selectInjectableFields("assessment", draft);
    const keys = fields.map((f: { key: string }) => f.key);
    expect(keys).toContain("mainComplaints");
    expect(keys).toContain("overview");
    expect(keys).not.toContain("lifeHistory"); // 空欄は除外

    const main = fields.find((f: { key: string }) => f.key === "mainComplaints");
    expect(main.mapping.confidence).toBe("caution");
    expect(main.mapping.names).toContain("form:consultationSubjectPersonHimself");
  });

  it("carePlan: assessmentSummary → userLifeSubject / 総合方針はラベル探索", () => {
    const draft = {
      clientName: "要確認",
      assessmentSummary: "課題分析の結果...",
      comprehensivePolicy: "総合的な援助方針...",
    };
    const fields = adapter.selectInjectableFields("carePlan", draft);
    const summary = fields.find((f: { key: string }) => f.key === "assessmentSummary");
    expect(summary.mapping.names).toContain("form:userLifeSubject");
    const policy = fields.find((f: { key: string }) => f.key === "comprehensivePolicy");
    expect(policy.mapping.labelText).toBe("総合的な援助の方針");
  });

  it("未対応の documentType は空配列", () => {
    expect(adapter.selectInjectableFields("unknownType", { overallSummary: "x" })).toHaveLength(0);
  });
});

describe("CareNoteKaipoke 第4表（meetingSummary）", () => {
  const draft = {
    clientName: "要確認",
    meetingDate: "2026-07-10",
    meetingPlace: "利用者宅",
    meetingTime: "14:00〜14:45",
    attendees: [
      { affiliation: "○○居宅介護支援事業所", role: "介護支援専門員", name: "要確認" },
      { affiliation: "△△訪問介護", role: "サービス提供責任者", name: "要確認" },
    ],
    discussions: [
      { item: "入浴時の安全確保", details: "浴室への手すり設置を検討する。" },
      { item: "栄養状態の改善", details: "配食サービスの利用を提案。" },
    ],
    conclusion: "手すり設置と配食サービスを導入する。",
    remainingIssues: "次回開催は3か月後を予定。",
    itemsToConfirm: [],
  };

  it("開催日は date 種別・holdingMeetingYmd ベース名・解析済み日付を持つ", () => {
    const fields = adapter.selectInjectableFields("meetingSummary", draft);
    const date = fields.find((f: { key: string }) => f.key === "meetingDate");
    expect(date.mapping.kind).toBe("date");
    expect(date.mapping.baseName).toBe("form:holdingMeetingYmd");
    expect(date.parsedDate).toEqual({ era: "令和", eraYear: 8, month: 7, day: 10 });
  });

  it("出席者は 所属（役割）/氏名 の2系統の連番欄（最大9行）に分解される", () => {
    const fields = adapter.selectInjectableFields("meetingSummary", draft);
    const belong = fields.find((f: { key: string }) => f.key === "attendeeAffiliations");
    expect(belong.mapping.baseName).toBe("form:conventionAttendancePersonBelongName");
    expect(belong.mapping.maxCount).toBe(9);
    expect(belong.values).toEqual([
      "○○居宅介護支援事業所（介護支援専門員）",
      "△△訪問介護（サービス提供責任者）",
    ]);
    const names = fields.find((f: { key: string }) => f.key === "attendeeNames");
    expect(names.mapping.baseName).toBe("form:conventionAttendancePersonFullName");
    expect(names.values).toEqual(["要確認", "要確認"]);
  });

  it("出席者が10名以上なら上限超過の警告を付ける", () => {
    const many = {
      ...draft,
      attendees: Array.from({ length: 10 }, (_, i) => ({
        affiliation: `事業所${i + 1}`,
        role: "担当",
        name: "要確認",
      })),
    };
    const fields = adapter.selectInjectableFields("meetingSummary", many);
    const belong = fields.find((f: { key: string }) => f.key === "attendeeAffiliations");
    expect(belong.values).toHaveLength(10);
    expect(belong.warnings.some((w: string) => w.includes("9行まで"))).toBe(true);
  });

  it("検討事項は 項目列挙→considerationAlternateSubject / details連結→considerationSubject", () => {
    const fields = adapter.selectInjectableFields("meetingSummary", draft);
    const items = fields.find((f: { key: string }) => f.key === "discussionItems");
    expect(items.mapping.names).toContain("form:considerationAlternateSubject");
    expect(items.value).toBe("1. 入浴時の安全確保\n2. 栄養状態の改善");
    const details = fields.find((f: { key: string }) => f.key === "discussionDetails");
    expect(details.mapping.names).toContain("form:considerationSubject");
    expect(details.value).toBe("1. 浴室への手すり設置を検討する。\n2. 配食サービスの利用を提案。");
  });

  it("結論・残された課題のマッピング", () => {
    const fields = adapter.selectInjectableFields("meetingSummary", draft);
    const conclusion = fields.find((f: { key: string }) => f.key === "conclusion");
    expect(conclusion.mapping.names).toContain("form:conclusionSubject");
    const remaining = fields.find((f: { key: string }) => f.key === "remainingIssues");
    expect(remaining.mapping.names).toContain("form:remainingThemeSubject");
  });
});

describe("CareNoteKaipoke 第5表（supportLog・エントリ単位）", () => {
  const draft: SupportLogDraft = {
    clientName: "要確認",
    entries: [
      {
        date: "2026-07-10 14:00",
        category: "モニタリング訪問",
        action: "自宅を訪問し状態を確認した。",
        background: "月次モニタリングのため。",
        factsAndStatements: "本人「調子は変わらない」。",
        judgement: "現行プランの継続が妥当。",
        nextAction: "次回訪問は8月中旬。",
      },
      {
        date: "初回訪問時",
        category: "電話連絡（家族）",
        action: "長女へ電話連絡した。",
        background: "サービス変更の相談のため。",
        factsAndStatements: "長女「平日日中は不在」。",
        judgement: "曜日調整が必要。",
        nextAction: "事業所へ空き状況を確認する。",
      },
    ],
    itemsToConfirm: [],
  };

  it("本文の書式が lib/draftText.ts の supportLogToText の1エントリ部分と一致する", () => {
    const single: SupportLogDraft = { ...draft, entries: [draft.entries[0]] };
    // lib 側の出力: [利用者名, "", ■見出し, 5層×5行] → 5層部分だけを取り出して比較
    const libLayers = supportLogToText(single).split("\n").slice(3).join("\n");
    expect(adapter.supportLogEntryToText(draft.entries[0])).toBe(libLayers);
  });

  it("既定は entries[0]、options.entryIndex で対象エントリを切り替える", () => {
    const first = adapter.selectInjectableFields("supportLog", draft);
    const firstBody = first.find((f: { key: string }) => f.key === "entryBody");
    expect(firstBody.value).toContain("【対応内容】自宅を訪問し状態を確認した。");
    const firstDate = first.find((f: { key: string }) => f.key === "entryDate");
    expect(firstDate.mapping.baseName).toBe("form:supportProgressYmd");
    expect(firstDate.parsedDate).toEqual({ era: "令和", eraYear: 8, month: 7, day: 10 });

    const second = adapter.selectInjectableFields("supportLog", draft, { entryIndex: 1 });
    const secondBody = second.find((f: { key: string }) => f.key === "entryBody");
    expect(secondBody.value).toContain("【対応内容】長女へ電話連絡した。");
    expect(secondBody.mapping.names).toContain("form:supportProgressSubject");
    // 「初回訪問時」は解析不能 → parsedDate は null（inject 側で日付スキップ＋警告）
    const secondDate = second.find((f: { key: string }) => f.key === "entryDate");
    expect(secondDate.parsedDate).toBeNull();
  });

  it("entryIndex が範囲外なら流し込み対象なし", () => {
    expect(adapter.selectInjectableFields("supportLog", draft, { entryIndex: 9 })).toHaveLength(0);
  });
});

describe("CareNoteKaipoke モニタリング（monitoring）", () => {
  const draft = {
    clientName: "要確認",
    overallSummary: "全体として在宅生活は安定している。",
    goalEvaluations: [
      {
        goal: "屋内を安全に移動できる",
        achievement: "一部達成",
        evidence: "見守りのもと廊下を歩行できている。",
        proposal: "継続",
      },
    ],
    planRecommendation: "継続",
    itemsToConfirm: [],
  };

  it("総合所見→synthesisComputationSubject / 目標評価→stmRemarks{N}（3点連結）", () => {
    const fields = adapter.selectInjectableFields("monitoring", draft);
    const summary = fields.find((f: { key: string }) => f.key === "overallSummary");
    expect(summary.mapping.names).toContain("form:synthesisComputationSubject");
    const goals = fields.find((f: { key: string }) => f.key === "goalEvaluations");
    expect(goals.mapping.baseName).toBe("form:stmRemarks");
    expect(goals.mapping.maxCount).toBe(5);
    expect(goals.values).toEqual([
      "達成状況: 一部達成／根拠: 見守りのもと廊下を歩行できている。／提案: 継続",
    ]);
  });

  it("目標が6件以上なら上限超過の警告を付ける", () => {
    const many = {
      ...draft,
      goalEvaluations: Array.from({ length: 6 }, (_, i) => ({
        goal: `目標${i + 1}`,
        achievement: "達成",
        evidence: "根拠",
        proposal: "継続",
      })),
    };
    const fields = adapter.selectInjectableFields("monitoring", many);
    const goals = fields.find((f: { key: string }) => f.key === "goalEvaluations");
    expect(goals.warnings.some((w: string) => w.includes("5行まで"))).toBe(true);
  });

  it("実施日（enforcementYmd）は draft に無いのでマッピングしない", () => {
    const baseNames = adapter.FIELD_MAPS.monitoring
      .map((m: { baseName?: string }) => m.baseName)
      .filter(Boolean);
    expect(baseNames).not.toContain("form:enforcementYmd");
  });
});

describe("CareNoteKaipoke 追記モード（buildAppendedValue・純粋関数）", () => {
  it("既存の末尾に改行で足し、末尾の空白は詰める", () => {
    expect(
      adapter.buildAppendedValue("既存の記録。\n\n", "2026-09-10 電話（長女）: 夜間の失敗が増加。"),
    ).toBe("既存の記録。\n2026-09-10 電話（長女）: 夜間の失敗が増加。");
  });

  it("既存が空なら追記文だけ、追記文が空なら null", () => {
    expect(adapter.buildAppendedValue("", "追記")).toBe("追記");
    expect(adapter.buildAppendedValue("既存", "   ")).toBeNull();
  });

  it("同じ文が既に入っていれば null（二重追記を防ぐ）", () => {
    expect(
      adapter.buildAppendedValue("既存。\n2026-09-10 電話: 同じ文。", "2026-09-10 電話: 同じ文。"),
    ).toBeNull();
  });
});

describe("CareNoteKaipoke 保存できない文字の正規化（normalizeForKaipoke・純粋関数）", () => {
  it("波ダッシュを全角チルダに、丸数字とローマ数字を括弧数字・英字にする", () => {
    expect(adapter.normalizeForKaipoke("R8.07.10〜R8.09.30")).toBe("R8.07.10～R8.09.30");
    expect(adapter.normalizeForKaipoke("①転倒 ②服薬 ㉑その他")).toBe("(1)転倒 (2)服薬 (21)その他");
    expect(adapter.normalizeForKaipoke("要介護Ⅱ・ⅲ期")).toBe("要介護II・iii期");
  });

  it("組文字と大量の空白を整える。普通の文章はそのまま", () => {
    expect(adapter.normalizeForKaipoke("居室12㎡、体重52㎏")).toBe("居室12m2、体重52kg");
    expect(adapter.normalizeForKaipoke("A様　　　来所")).toBe("A様 来所");
    expect(adapter.normalizeForKaipoke("夜間の排泄で失敗が増えた。\n翌朝に確認。")).toBe(
      "夜間の排泄で失敗が増えた。\n翌朝に確認。",
    );
  });
});

describe("CareNoteKaipoke measureText 総文字数の安全上限", () => {
  it("行×字−行数 を超えると警告する（画面2行×20字の欄で40字は登録エラーになった実例）", () => {
    const mapping = { key: "x", label: "緊急連絡", names: [], maxRows: 2, maxColsFullWidth: 20 };
    const ok = adapter.measureText(`${"あ".repeat(18)}\n${"い".repeat(18)}`, mapping); // 37字
    expect(ok.overTotal).toBe(false);
    const over = adapter.measureText(`${"あ".repeat(20)}\n${"い".repeat(19)}`, mapping); // 40字
    expect(over.overTotal).toBe(true);
    expect(over.warnings.some((w) => w.includes("安全上限38字"))).toBe(true);
  });
});

describe("CareNoteKaipoke カイポケ転記シート（kaipokePageFields・純粋関数）", () => {
  it("指定ページの欄だけを返し、空文字の欄は除く", () => {
    const sheet = {
      fields: [
        { page: 4, formName: "form:caseOrMedicalHistorySubject", text: "脳梗塞の既往。" },
        { page: 4, formName: "form:specialMentionMatterSubject1", text: "   " },
        { page: 10, formName: "form:summarySubject", text: "全体像。" },
      ],
    };
    expect(adapter.kaipokePageFields(sheet, 4).map((f) => f.formName)).toEqual([
      "form:caseOrMedicalHistorySubject",
    ]);
    expect(adapter.kaipokePageFields(sheet, 10)).toHaveLength(1);
    expect(adapter.kaipokePageFields({}, 1)).toEqual([]);
  });
});

describe("CareNoteKaipoke readFieldValue（欄の今の文章を読む）", () => {
  it("要素の value を返す。value が無ければ空文字（getValue(draft,key) と取り違えない）", () => {
    expect(adapter.readFieldValue({ value: "既存の記録。" })).toBe("既存の記録。");
    expect(adapter.readFieldValue({})).toBe("");
    expect(adapter.readFieldValue(null)).toBe("");
    // 取り違えの再発防止: 下書き用 getValue に要素を渡しても空になる＝「既存が空」と誤判定する
    expect(adapter.getValue({ value: "既存の記録。" }, undefined as unknown as string)).toBe("");
  });
});

describe("CareNoteKaipoke 第2表の1件ずつ流し込み（純粋関数）", () => {
  const draft = {
    clientName: "A様",
    needs: [
      {
        need: "転ばずに家で暮らしたい",
        longTermGoal: "自宅内を安全に移動できる",
        longTermPeriod: "6か月",
        shortTermGoal: "手すりを使って歩ける",
        shortTermPeriod: "3か月",
        services: [
          {
            content: "歩行訓練",
            serviceType: "訪問リハビリテーション",
            frequency: "週2回",
            period: "R8.07.10〜R8.09.30",
            provider: "○○訪問看護ステーション",
          },
          {
            content: "見守り",
            serviceType: "家族",
            frequency: "毎日",
            period: "R8.07.10〜R8.09.30",
            provider: "長女",
          },
        ],
      },
    ],
  };

  it("buildPlan2Steps: ニーズ→長期→短期→(サービス内容→種別→事業所)×件数 の順", () => {
    const steps = adapter.buildPlan2Steps(draft);
    expect(steps.map((s) => s.kind)).toEqual([
      "need",
      "longTerm",
      "shortTerm",
      "serviceContent",
      "serviceKind",
      "provider",
      "serviceContent",
      "serviceKind",
      "provider",
    ]);
    expect(steps[0].text).toBe("転ばずに家で暮らしたい");
    expect(steps[5].text).toBe("○○訪問看護ステーション／週2回／R8.07.10〜R8.09.30");
    expect(adapter.buildPlan2Steps({})).toEqual([]);
  });

  it("parseFrequency: 週2回→01、毎日→02、その他→03", () => {
    expect(adapter.parseFrequency("週2回")).toEqual({ mode: "01", unit: "02", count: 2 });
    expect(adapter.parseFrequency("月1回")).toEqual({ mode: "01", unit: "03", count: 1 });
    expect(adapter.parseFrequency("1日3回")).toEqual({ mode: "01", unit: "01", count: 3 });
    expect(adapter.parseFrequency("毎日")).toEqual({ mode: "02", fixed: "01" });
    expect(adapter.parseFrequency("必要時")).toEqual({ mode: "02", fixed: "04" });
    expect(adapter.parseFrequency("3か月に1回")).toEqual({ mode: "03", text: "3か月に1回" });
  });

  it("classifyServiceType: 介護保険サービスは01、本人・家族・医療機関は02", () => {
    expect(adapter.classifyServiceType("訪問リハビリテーション")).toEqual({
      category: "01",
      kindText: "訪問リハビリテーション",
    });
    expect(adapter.classifyServiceType("家族")).toEqual({ category: "02", name: "家族" });
    expect(adapter.classifyServiceType("")).toEqual({ category: "02", name: "その他" });
  });

  it("plan2ScreenFromNames: 欄名とURLから追加画面を判定する", () => {
    expect(adapter.plan2ScreenFromNames(["form:longTimePeriodMarkSubject"], "")).toBe("longTerm");
    expect(adapter.plan2ScreenFromNames(["form:idCompanyDto", "HINDO_KBN"], "")).toBe("provider");
    expect(
      adapter.plan2ScreenFromNames(
        ["form:accept"],
        "https://r.kaipoke.biz/kaipokebiz/business/care_plan/care/MEM091704.do?x=1",
      ),
    ).toBe("need");
    expect(
      adapter.plan2ScreenFromNames(
        [],
        "https://r.kaipoke.biz/kaipokebiz/business/care_plan/care/MEM091721.do",
      ),
    ).toBe("list");
    expect(adapter.plan2ScreenFromNames([], "")).toBe("unknown");
  });
});

describe("再ログイン検知ゲートの対象一覧: WRITE_MESSAGE_TYPES / isWriteMessage", () => {
  it("書き込み系5種（第2表流し込みを含む）を判定し、PING は書き込みではない", () => {
    for (const t of [
      "CARENOTE_INJECT",
      "CARENOTE_APPEND_PREVIEW",
      "CARENOTE_APPEND_APPLY",
      "CARENOTE_APPEND_UNDO",
      "CARENOTE_PLAN2_FILL",
    ]) {
      expect(adapter.isWriteMessage(t)).toBe(true);
    }
    expect(adapter.isWriteMessage("CARENOTE_PING")).toBe(false);
    expect(adapter.isWriteMessage(undefined)).toBe(false);
    expect(adapter.WRITE_MESSAGE_TYPES).toHaveLength(5);
  });
});
