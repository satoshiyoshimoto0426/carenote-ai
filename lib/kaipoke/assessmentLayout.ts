/**
 * カイポケ アセスメント（11ページ）の自由記述欄の一覧。純粋データ（ブラウザ・サーバ両方で読める）。
 *
 * なぜ存在するか:
 *   CareNote の下書き（課題分析14項目の構造）と、カイポケの画面（ページごとの欄）は形が違う。
 *   「カイポケのページ順・欄名・文字数に合わせて出す」ために、欄の一覧を1か所に持つ。
 *   出典: docs/KAIPOKE-TRANSCRIPTION-SPEC.md §1（実機転記で確認したフォーム名と「最大N行×全角M文字」）。
 *   チェック欄・ラジオ・セレクトは対象外（文章ではないので人が画面で選ぶ）。
 *
 * 文字数の安全上限:
 *   サーバ側は「改行込みの総文字数」で検証する欄がある（同 §5-2: 画面2行×20字で40字が NG）。
 *   行×字−行数 を安全上限にする（extension の measureText と同じ式）。TX は max 文字数そのまま。
 */

export interface KaipokeFieldSpec {
  /** 何枚目か（1〜10。11枚目のスケジュール表は対象外） */
  page: number;
  /** カイポケのフォーム名（同じ名前が別ページにもあるので page と組で扱う） */
  formName: string;
  /** 画面のラベル */
  label: string;
  /** TA の最大行数（TX は undefined） */
  maxRows?: number;
  /** TA の1行あたり全角文字数（TX は undefined） */
  maxCols?: number;
  /** TX の最大文字数 */
  maxChars?: number;
  /** AIへの書き分けのヒント（何を書く欄か） */
  hint: string;
}

export const KAIPOKE_PAGE_TITLES: Record<number, string> = {
  1: "フェイスシート",
  2: "家族情報・サービス利用",
  3: "サービス利用・住居",
  4: "健康状態",
  5: "基本（身体機能・起居）動作",
  6: "生活機能（食事・排泄）",
  7: "認知機能・精神行動障害",
  8: "社会生活力",
  9: "医療・健康関係",
  10: "全体のまとめ",
};

export const KAIPOKE_ASSESSMENT_FIELDS: KaipokeFieldSpec[] = [
  {
    page: 1,
    formName: "form:consultationSubjectPersonHimself",
    label: "相談内容（本人）",
    maxRows: 10,
    maxCols: 26,
    hint: "本人の主訴・意向。本人の言葉は「」で",
  },
  {
    page: 1,
    formName: "form:consultationSubjectFamily",
    label: "相談内容（家族）",
    maxRows: 4,
    maxCols: 26,
    hint: "家族の主訴・意向（続柄で書く）",
  },
  {
    page: 1,
    formName: "form:progressSubject",
    label: "これまでの生活の経過",
    maxRows: 16,
    maxCols: 26,
    hint: "生活歴。時系列で。地名・固有名詞は書かない",
  },
  {
    page: 2,
    formName: "form:nursingCircumstancesSubject",
    label: "家族の介護の状況・問題点",
    maxRows: 14,
    maxCols: 35,
    hint: "主介護者の続柄・介護力・負担・問題点",
  },
  {
    page: 2,
    formName: "form:supportOfferPersonSubject",
    label: "インフォーマル：支援提供者",
    maxRows: 9,
    maxCols: 8,
    hint: "近隣・友人・民生委員など（続柄・役割のみ）",
  },
  {
    page: 2,
    formName: "form:supportSubject",
    label: "活用している支援内容",
    maxRows: 9,
    maxCols: 16,
    hint: "インフォーマルな支援の内容。公的サービスはチェック欄なので書かない",
  },
  {
    page: 2,
    formName: "form:necessarySupportSubject",
    label: "受けたい支援",
    maxRows: 9,
    maxCols: 16,
    hint: "本人・家族が望む支援",
  },
  {
    page: 2,
    formName: "form:specialMentionMatterSubject",
    label: "特記事項（家族・サービス）",
    maxRows: 9,
    maxCols: 16,
    hint: "家族状況・サービス利用の補足",
  },
  {
    page: 3,
    formName: "form:specialMentionMatterSubject",
    label: "特記事項（住居・制度）",
    maxRows: 5,
    maxCols: 57,
    hint: "住環境（段差・手すり・寝具・トイレ・浴室）や制度利用の補足。住所は書かない",
  },
  {
    page: 4,
    formName: "form:caseOrMedicalHistorySubject",
    label: "既往歴・現症",
    maxRows: 8,
    maxCols: 29,
    hint: "診断名と経過。時期は年月で。「〜」は使わない",
  },
  {
    page: 4,
    formName: "form:specialMentionMatterSubject1",
    label: "特記事項（健康状態）",
    maxRows: 7,
    maxCols: 58,
    hint: "受診状況・服薬管理・医療連携の補足。医療機関名は「かかりつけ医」等",
  },
  {
    page: 4,
    formName: "form:specialMentionMatterSubject2",
    label: "特記・配慮すべき課題（健康）",
    maxRows: 6,
    maxCols: 58,
    hint: "健康面で配慮すべき課題・リスク",
  },
  {
    page: 5,
    formName: "form:specialMentionMatterSubject1",
    label: "特記（体位変換・起居）",
    maxRows: 9,
    maxCols: 33,
    hint: "麻痺・拘縮・起居動作の現状と介助内容",
  },
  {
    page: 5,
    formName: "form:specialMentionMatterSubject2",
    label: "特記（入浴）",
    maxRows: 11,
    maxCols: 33,
    hint: "入浴の現状・介助・希望",
  },
  {
    page: 5,
    formName: "form:specialMentionMatterSubject3",
    label: "特記（コミュニケーション）",
    maxRows: 11,
    maxCols: 33,
    hint: "視聴覚・言語・電話・支援機器",
  },
  {
    page: 6,
    formName: "form:specialMentionMatterSubject1",
    label: "特記（食事）",
    maxRows: 13,
    maxCols: 22,
    hint: "食事場所・咀嚼嚥下・食事内容・介助",
  },
  {
    page: 6,
    formName: "form:specialMentionMatterSubject2",
    label: "特記（排泄）",
    maxRows: 3,
    maxCols: 39,
    hint: "排尿・排便の現状と介助（短く）",
  },
  {
    page: 6,
    formName: "form:specialMentionMatterSubject3",
    label: "特記（外出）",
    maxRows: 5,
    maxCols: 35,
    hint: "外出・移送の現状と介助",
  },
  {
    page: 7,
    formName: "form:familyInfoSubject",
    label: "家族等からの情報と観察",
    maxRows: 21,
    maxCols: 32,
    hint: "認知機能・精神行動面について家族からの情報と観察した事実",
  },
  {
    page: 7,
    formName: "form:assistancePresentConditionFamilySubject",
    label: "援助の現状（家族）",
    maxRows: 9,
    maxCols: 16,
    hint: "家族が行っている援助",
  },
  {
    page: 7,
    formName: "form:assistancePresentConditionServiceSubject",
    label: "援助の現状（サービス）",
    maxRows: 9,
    maxCols: 16,
    hint: "サービスで行われている援助",
  },
  {
    page: 7,
    formName: "form:assistanceHopePersonHimselfSubject",
    label: "援助の希望（本人）",
    maxRows: 10,
    maxCols: 32,
    hint: "本人の希望",
  },
  {
    page: 7,
    formName: "form:assistanceHopeFamilySubject",
    label: "援助の希望（家族）",
    maxRows: 6,
    maxCols: 32,
    hint: "家族の希望",
  },
  {
    page: 7,
    formName: "form:assistancePlanSubject",
    label: "援助の計画",
    maxRows: 10,
    maxCols: 32,
    hint: "認知・精神行動面の援助方針",
  },
  {
    page: 7,
    formName: "form:specialMentionMatterSubject",
    label: "特記（認知・精神）",
    maxRows: 5,
    maxCols: 34,
    hint: "補足",
  },
  {
    page: 8,
    formName: "form:emergencyContactSubject",
    label: "緊急連絡・見守りの方法",
    maxRows: 2,
    maxCols: 20,
    hint: "誰に（続柄）どう連絡するか。改行込み38字以内",
  },
  {
    page: 8,
    formName: "form:specialMentionMatterSubject",
    label: "特記（社会生活力）",
    maxRows: 16,
    maxCols: 57,
    hint: "金銭管理・買い物・調理・交流・社会参加の現状と援助",
  },
  {
    page: 9,
    formName: "form:specialMentionMatterSubject",
    label: "特記（医療・健康）",
    maxRows: 13,
    maxCols: 24,
    hint: "処置・服薬管理・受診介助・リハの補足",
  },
  {
    page: 9,
    formName: "form:nutritionHeedPointSubject",
    label: "栄養留意点",
    maxChars: 80,
    hint: "栄養面の留意点（80字）",
  },
  {
    page: 9,
    formName: "form:dealWithObjectiveSubject",
    label: "対処方針",
    maxChars: 80,
    hint: "現状の問題への対処方針（80字）",
  },
  {
    page: 10,
    formName: "form:summarySubject",
    label: "全体のまとめ",
    maxRows: 26,
    maxCols: 54,
    hint: "全体像。健康・心身・生活・家族・サービス・意向の順",
  },
];

/** 欄の安全上限（文字数・改行込み）。TA は 行×字−行数、TX は maxChars */
export function safeLimit(f: KaipokeFieldSpec): number {
  if (typeof f.maxChars === "number") return f.maxChars;
  if (typeof f.maxRows === "number" && typeof f.maxCols === "number") {
    return f.maxRows * f.maxCols - f.maxRows;
  }
  return Number.POSITIVE_INFINITY;
}

/** 欄の識別子（同じフォーム名が別ページにあるので page と組で一意にする） */
export function fieldKey(f: { page: number; formName: string }): string {
  return `p${f.page}:${f.formName}`;
}

/** AIが返す1欄 */
export interface KaipokeSheetField {
  page: number;
  formName: string;
  /** 欄の文章（情報が無ければ空文字） */
  text: string;
  /** 入力に根拠が無く推測を含むなら true（画面で「推測を含む」と表示） */
  isInferred: boolean;
  /** 職員へのひとこと（根拠の出典・確認してほしい点。無ければ空） */
  note: string;
}

export interface KaipokeAssessmentSheet {
  fields: KaipokeSheetField[];
}

export interface FieldCheck {
  key: string;
  length: number;
  limit: number;
  over: boolean;
}

/** 各欄の文字数と安全上限を照らす（画面表示と流し込み前の警告に使う） */
export function checkSheet(sheet: KaipokeAssessmentSheet): FieldCheck[] {
  const specByKey = new Map(KAIPOKE_ASSESSMENT_FIELDS.map((f) => [fieldKey(f), f]));
  return sheet.fields.map((f) => {
    const spec = specByKey.get(fieldKey(f));
    const limit = spec ? safeLimit(spec) : Number.POSITIVE_INFINITY;
    const length = f.text.length;
    return { key: fieldKey(f), length, limit, over: length > limit };
  });
}

/** コピー貼り付け用のプレーンテキスト（ページ順・欄名つき） */
export function sheetToText(sheet: KaipokeAssessmentSheet): string {
  const lines: string[] = [];
  for (let page = 1; page <= 10; page++) {
    const fields = KAIPOKE_ASSESSMENT_FIELDS.filter((s) => s.page === page);
    const rows = fields
      .map((spec) => sheet.fields.find((f) => f.page === page && f.formName === spec.formName))
      .filter((f): f is KaipokeSheetField => Boolean(f?.text.trim()));
    if (rows.length === 0) continue;
    lines.push(`■ ${page}枚目：${KAIPOKE_PAGE_TITLES[page]}`);
    for (const f of rows) {
      const spec = fields.find((s) => s.formName === f.formName);
      const tag = f.isInferred ? "【推測を含む】" : "";
      lines.push(`【${spec?.label ?? f.formName}】${tag}`);
      lines.push(f.text);
      lines.push("");
    }
  }
  return lines.join("\n").trimEnd();
}
