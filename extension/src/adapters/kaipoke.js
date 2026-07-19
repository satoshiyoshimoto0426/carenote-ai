/**
 * カイポケ・アダプタ（P2 Step2 半自動入力の中核）。
 *
 * なぜ存在するか:
 *   CareNote AI が生成した下書き（AssessmentDraft / CarePlanDraft /
 *   MeetingSummaryDraft / SupportLogDraft / MonitoringDraft）を、
 *   カイポケ（r.kaipoke.biz・JSF系画面）の帳票テキスト欄へ「流し込む」ための
 *   マッピングと書込ロジックを一箇所に集約する。フィールド名はすべて
 *   docs/KAIPOKE-DOM.md（2026-06-12 取得＋2026-07-19 追加取得）に基づく。
 *   推測値は置かない（§2.6-A）。
 *
 * 何と繋がるか:
 *   - content.js が本ファイルの globalThis.CareNoteKaipoke を使ってDOMへ書き込む。
 *   - panel.js から送られた下書き＋documentType を inject() が受け取る。
 *   - 純粋ロジック（selectInjectableFields / measureText 等）は vitest から
 *     module.exports 経由で読み込みテストする（adapters/kaipoke.test.ts）。
 *
 * 設計上の不変条件（SPEC F7 / §12 / docs/KAIPOKE-DOM.md「アダプタ設計への示唆」）:
 *   - 入力対象は「テキストエリア中心」。ラジオ/チェックの海は人の判断領域として残す。
 *   - 保存・確定は必ず人間。本アダプタは「該当欄へ書く＋ハイライト」までで止める。
 *   - カイポケ画面の内容を外部送信しない（読取は欄の存在確認＝screen判定のみ）。
 */
((root, factory) => {
  const api = factory();
  root.CareNoteKaipoke = api;
  // vitest（Node/CJS）からの読み込み用。content scriptでは module は未定義。
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  /**
   * @typedef {Object} FieldMapping
   * @property {string} key - CareNote下書きのフィールドキー（toValue使用時はレポート用の識別子）
   * @property {string} label - 表示・レポート用の日本語ラベル
   * @property {"text"|"date"|"sequential"} [kind] - 欄の種類（省略時は text=単一テキスト欄）
   * @property {string[]} [names] - 候補となる input/textarea の name（form:接頭辞込み。kind=text用）
   * @property {string} [labelText] - name で見つからない時に近接探索するラベル文言（kind=text用）
   * @property {string} [baseName] - kind=date: "form:xxxYmd"（+Era/Year/Month/Day の4セレクト）
   *   ／ kind=sequential: "form:xxx"（+0..N-1 の連番欄）
   * @property {number} [maxCount] - kind=sequential の行数上限（超過分は入力せず警告）
   * @property {(draft: Record<string, unknown>, options?: InjectOptions) => string} [toValue]
   *   - 下書きから欄の値を組み立てる純粋関数（省略時は draft[key] の文字列をそのまま使う）
   * @property {(draft: Record<string, unknown>, options?: InjectOptions) => string[]} [toValues]
   *   - kind=sequential 用。連番欄それぞれの値（行の対応関係を保つため空行も詰めない）
   * @property {number} [maxRows] - テキストエリアの最大行数（超過は警告のみ）
   * @property {number} [maxColsFullWidth] - 1行あたりの全角文字数上限（超過は警告のみ）
   * @property {"clean"|"caution"} [confidence] - caution=要人手確認（曖昧マッピング）
   * @property {string} [note] - 要確認の理由など、人へのメッセージ
   */

  /**
   * @typedef {Object} InjectOptions
   * @property {number} [entryIndex] - supportLog 用: entries の何件目を流し込むか（省略時 0）。
   *   カイポケ第5表は「1記録＝1フォーム」のため、1回の inject で1エントリだけ書く。
   */

  /**
   * documentType ごとの「CareNote下書き → カイポケ欄」マッピング。
   * 出典: docs/KAIPOKE-DOM.md（アセスメント P1/P10、ケアプラン第1表、
   * 2026-07-19 追加取得: 第4表 MEM092601 / 第5表 MEM092701 / モニタリング MEM091801）。
   * @type {Record<string, FieldMapping[]>}
   */
  const FIELD_MAPS = {
    assessment: [
      {
        key: "mainComplaints",
        label: "主訴・意向（P1 本人欄）",
        names: ["form:consultationSubjectPersonHimself"],
        maxRows: 10,
        confidence: "caution",
        note: "本人欄に全文を入力します。家族の主訴は手作業で家族欄へ分けてください。",
      },
      {
        key: "lifeHistory",
        label: "生活歴・経過（P1）",
        names: ["form:progressSubject"],
        maxRows: 16,
        confidence: "clean",
      },
      {
        key: "overview",
        label: "全体のまとめ（P10）",
        names: ["form:summarySubject"],
        maxRows: 26,
        maxColsFullWidth: 54,
        confidence: "clean",
      },
    ],
    carePlan: [
      {
        key: "assessmentSummary",
        label: "意向を踏まえた課題分析の結果（第1表）",
        names: ["form:userLifeSubject"],
        confidence: "clean",
      },
      {
        key: "comprehensivePolicy",
        label: "総合的な援助の方針（第1表）",
        names: [],
        labelText: "総合的な援助の方針",
        confidence: "clean",
        note: "カイポケ側のname難読化のため、見出しラベルから近接探索して入力します。",
      },
    ],
    meetingSummary: [
      {
        key: "meetingDate",
        label: "開催日（第4表）",
        kind: "date",
        baseName: "form:holdingMeetingYmd",
        confidence: "clean",
      },
      {
        key: "meetingPlace",
        label: "開催場所（第4表）",
        names: ["form:holdingMeetingPlace"],
        confidence: "clean",
      },
      {
        key: "attendeeAffiliations",
        label: "出席者・所属（第4表）",
        kind: "sequential",
        baseName: "form:conventionAttendancePersonBelongName",
        maxCount: 9,
        toValues: (draft) => attendeesOf(draft).map(formatAttendeeAffiliation),
        confidence: "clean",
      },
      {
        key: "attendeeNames",
        label: "出席者・氏名（第4表）",
        kind: "sequential",
        baseName: "form:conventionAttendancePersonFullName",
        maxCount: 9,
        toValues: (draft) => attendeesOf(draft).map((a) => String(a?.name ?? "").trim()),
        confidence: "clean",
      },
      {
        key: "discussionItems",
        label: "検討した項目（第4表）",
        names: ["form:considerationAlternateSubject"],
        toValue: (draft) => discussionItemsText(draft?.discussions),
        confidence: "clean",
      },
      {
        key: "discussionDetails",
        label: "検討内容（第4表）",
        names: ["form:considerationSubject"],
        toValue: (draft) => discussionDetailsText(draft?.discussions),
        confidence: "clean",
      },
      {
        key: "conclusion",
        label: "結論（第4表）",
        names: ["form:conclusionSubject"],
        confidence: "clean",
      },
      {
        key: "remainingIssues",
        label: "残された課題（第4表）",
        names: ["form:remainingThemeSubject"],
        confidence: "clean",
      },
    ],
    supportLog: [
      {
        key: "entryDate",
        label: "年月日（第5表・記録フォーム）",
        kind: "date",
        baseName: "form:supportProgressYmd",
        toValue: (draft, options) => String(supportLogEntryAt(draft, options)?.date ?? ""),
        confidence: "clean",
      },
      {
        key: "entryBody",
        label: "支援経過・本文（第5表・記録フォーム）",
        names: ["form:supportProgressSubject"],
        toValue: (draft, options) => supportLogEntryToText(supportLogEntryAt(draft, options)),
        confidence: "clean",
      },
    ],
    monitoring: [
      {
        key: "overallSummary",
        label: "総合所見（モニタリング）",
        names: ["form:synthesisComputationSubject"],
        confidence: "clean",
      },
      {
        key: "goalEvaluations",
        label: "目標評価・特記事項（モニタリング）",
        kind: "sequential",
        baseName: "form:stmRemarks",
        maxCount: 5,
        toValues: (draft) =>
          (Array.isArray(draft?.goalEvaluations) ? draft.goalEvaluations : []).map(
            goalEvaluationToText,
          ),
        confidence: "clean",
      },
      // 実施日（form:enforcementYmd*）は MonitoringDraft に該当フィールドが無いため触らない。
    ],
  };

  /** カイポケ自動入力に対応している documentType（他はパネルのコピー支援のみ）。 */
  const INJECTABLE_TYPES = Object.keys(FIELD_MAPS);

  /**
   * 1文字の表示幅を返す（半角=0.5 / 全角=1）。
   * カイポケの「全角◯文字」上限の概算判定に使う。
   * @param {string} ch
   * @returns {number}
   */
  function charWidth(ch) {
    // ASCII・ラテン1補助・半角カナは半角扱い。それ以外（日本語等）は全角扱い。
    return /[ -ÿ｡-ﾟ]/.test(ch) ? 0.5 : 1;
  }

  /**
   * 1行の全角換算幅を返す（切り上げ）。
   * @param {string} line
   * @returns {number}
   */
  function lineFullWidth(line) {
    let w = 0;
    for (const ch of line) {
      w += charWidth(ch);
    }
    return Math.ceil(w);
  }

  /**
   * 値がカイポケ欄の行数・桁数上限に収まるかを計測する（超過しても止めない＝警告のみ）。
   * @param {string} value
   * @param {FieldMapping} mapping
   * @returns {{rows:number, maxLineWidth:number, overRows:boolean, overCols:boolean, warnings:string[]}}
   */
  function measureText(value, mapping) {
    const lines = String(value ?? "").split("\n");
    const rows = lines.length;
    let maxLineWidth = 0;
    for (const line of lines) {
      const w = lineFullWidth(line);
      if (w > maxLineWidth) maxLineWidth = w;
    }
    const overRows = typeof mapping.maxRows === "number" && rows > mapping.maxRows;
    const overCols =
      typeof mapping.maxColsFullWidth === "number" && maxLineWidth > mapping.maxColsFullWidth;
    const warnings = [];
    if (overRows) {
      warnings.push(`行数が上限(${mapping.maxRows}行)を超えています（現在${rows}行）。`);
    }
    if (overCols) {
      warnings.push(
        `1行が上限(全角${mapping.maxColsFullWidth}文字)を超えています（最長${maxLineWidth}相当）。`,
      );
    }
    return { rows, maxLineWidth, overRows, overCols, warnings };
  }

  /**
   * 下書きから指定キーの文字列値を取り出す。
   * @param {Record<string, unknown>} draft
   * @param {string} key
   * @returns {string}
   */
  function getValue(draft, key) {
    const v = draft ? draft[key] : undefined;
    return typeof v === "string" ? v : "";
  }

  // ---- 帳票別の値組み立て・日付解析（純粋関数・DOM非依存） ----

  /**
   * 月・日の値として妥当か（1..12 / 1..31 の粗い検査。存在しない日付の厳密検査はしない）。
   * @param {number} month
   * @param {number} day
   * @returns {boolean}
   */
  function isValidMonthDay(month, day) {
    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
  }

  /**
   * 西暦年月日を和暦（元号＋年）へ変換する。カイポケの日付セレクトは
   * 「元号sel＋年sel」構成のため、西暦入力はここで変換して書き込む。
   * 改元境界（令和=2019-05-01〜 / 平成=1989-01-08〜）は月日まで見て判定する。
   * @param {number} year
   * @param {number} month
   * @param {number} day
   * @returns {{era:string, eraYear:number}|null} 昭和より前は対象外として null
   */
  function toWareki(year, month, day) {
    if (year > 2019 || (year === 2019 && month >= 5)) return { era: "令和", eraYear: year - 2018 };
    if (year > 1989 || (year === 1989 && (month > 1 || day >= 8))) {
      return { era: "平成", eraYear: year - 1988 };
    }
    if (year >= 1926) return { era: "昭和", eraYear: year - 1925 };
    return null;
  }

  /**
   * 帳票下書きの日付文字列を、日付セレクト書込用の値に分解する（純粋関数）。
   * 対応形式: YYYY-MM-DD / YYYY/M/D / M/D（年なし）/ 令和N年M月D日（元年・平成・昭和も可）。
   * 日付の後ろに時刻等が続いてもよい（例:「2026-07-10 14:00ごろ」→ 日付部分のみ解析）。
   * 「初回訪問時」等の相対表現は解析不能として null（呼び出し側で日付スキップ＋警告 ──
   * docs/KAIPOKE-DOM.md「追加マッピング方針」）。
   * @param {string} s
   * @returns {{era:string|null, eraYear:number|null, month:number, day:number}|null}
   *   era / eraYear が null のときは「年の指定なし」＝年号・年セレクトは変更しない。
   */
  function parseJapaneseDate(s) {
    const text = String(s ?? "").trim();
    let m = text.match(/^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:\s|$)/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[3]);
      const day = Number(m[4]);
      if (!isValidMonthDay(month, day)) return null;
      const wareki = toWareki(year, month, day);
      if (!wareki) return null;
      return { era: wareki.era, eraYear: wareki.eraYear, month, day };
    }
    m = text.match(/^(令和|平成|昭和)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
      const eraYear = m[2] === "元" ? 1 : Number(m[2]);
      const month = Number(m[3]);
      const day = Number(m[4]);
      if (eraYear < 1 || !isValidMonthDay(month, day)) return null;
      return { era: m[1], eraYear, month, day };
    }
    m = text.match(/^(\d{1,2})\/(\d{1,2})(?:\s|$)/);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      if (!isValidMonthDay(month, day)) return null;
      return { era: null, eraYear: null, month, day };
    }
    return null;
  }

  /**
   * 下書きから出席者配列を安全に取り出す（第4表用）。
   * @param {Record<string, unknown>} draft
   * @returns {{affiliation?:string, role?:string, name?:string}[]}
   */
  function attendeesOf(draft) {
    return Array.isArray(draft?.attendees) ? draft.attendees : [];
  }

  /**
   * 出席者の「所属」欄の値を作る。カイポケ第4表は所属・氏名の2欄構成で
   * 「役割」の専用欄が無いため、「所属（役割）」の形で連結する。
   * @param {{affiliation?:string, role?:string}} a
   * @returns {string}
   */
  function formatAttendeeAffiliation(a) {
    const affiliation = String(a?.affiliation ?? "").trim();
    const role = String(a?.role ?? "").trim();
    if (affiliation && role) return `${affiliation}（${role}）`;
    return affiliation || role;
  }

  /**
   * 検討事項の「検討した項目」欄向けテキスト（項目名の番号付き列挙）。
   * @param {{item?:string}[]|undefined} discussions
   * @returns {string}
   */
  function discussionItemsText(discussions) {
    if (!Array.isArray(discussions)) return "";
    return discussions.map((d, i) => `${i + 1}. ${String(d?.item ?? "").trim()}`).join("\n");
  }

  /**
   * 検討事項の「検討内容」欄向けテキスト（項目と同じ番号で details を連結し対応を保つ）。
   * @param {{details?:string}[]|undefined} discussions
   * @returns {string}
   */
  function discussionDetailsText(discussions) {
    if (!Array.isArray(discussions)) return "";
    return discussions.map((d, i) => `${i + 1}. ${String(d?.details ?? "").trim()}`).join("\n");
  }

  /**
   * supportLog の下書きから流し込み対象エントリを取り出す（options.entryIndex、省略時0）。
   * @param {Record<string, unknown>} draft
   * @param {InjectOptions} [options]
   * @returns {Record<string, string>|null} 範囲外は null（＝流し込み対象なし）
   */
  function supportLogEntryAt(draft, options) {
    const entries = Array.isArray(draft?.entries) ? draft.entries : [];
    const idx = Number.isInteger(options?.entryIndex) ? options.entryIndex : 0;
    return entries[idx] ?? null;
  }

  /**
   * 支援経過エントリ1件の本文（第5表 form:supportProgressSubject 用）。
   * lib/draftText.ts の supportLogToText の1エントリ部分（【対応内容】〜【今後の対応】の
   * 5層連結）と同一書式。extension は素のJSで lib を import できないため同等実装とし、
   * 整合は kaipoke.test.ts が lib 側の出力と突き合わせて担保する。
   * 日付・種別は本文に含めない（日付は form:supportProgressYmd* セレクトへ書く）。
   * @param {Record<string, string>|null} e
   * @returns {string}
   */
  function supportLogEntryToText(e) {
    if (!e) return "";
    return [
      `【対応内容】${e.action ?? ""}`,
      `【背景・理由】${e.background ?? ""}`,
      `【事実・発言】${e.factsAndStatements ?? ""}`,
      `【アセスメント・判断】${e.judgement ?? ""}`,
      `【今後の対応】${e.nextAction ?? ""}`,
    ].join("\n");
  }

  /**
   * 目標評価1件の連結テキスト（モニタリング form:stmRemarks{N} 用・1行連結）。
   * @param {{achievement?:string, evidence?:string, proposal?:string}} g
   * @returns {string}
   */
  function goalEvaluationToText(g) {
    const achievement = String(g?.achievement ?? "").trim();
    const evidence = String(g?.evidence ?? "").trim();
    const proposal = String(g?.proposal ?? "").trim();
    if (!achievement && !evidence && !proposal) return "";
    return `達成状況: ${achievement}／根拠: ${evidence}／提案: ${proposal}`;
  }

  /**
   * documentType と下書きから「カイポケへ流し込めるフィールド」の一覧を作る（純粋関数・DOM非依存）。
   * 値が空のフィールドは除外する。kind により戻り値の形が変わる:
   *   - text: value＋measure（行数・桁数計測）
   *   - date: value＋parsedDate（解析不能なら null ＝ inject 側で日付スキップ＋警告）
   *   - sequential: values（行対応を保つため空行も詰めない）＋warnings（上限超過）
   * @param {string} documentType
   * @param {Record<string, unknown>} draft
   * @param {InjectOptions} [options]
   * @returns {{key:string,label:string,mapping:FieldMapping,value?:string,values?:string[],
   *   measure?:ReturnType<typeof measureText>,parsedDate?:ReturnType<typeof parseJapaneseDate>,
   *   warnings?:string[]}[]}
   */
  function selectInjectableFields(documentType, draft, options) {
    const maps = FIELD_MAPS[documentType] || [];
    const result = [];
    for (const mapping of maps) {
      if (mapping.kind === "sequential") {
        const values = (mapping.toValues ? mapping.toValues(draft, options) : []).map((v) =>
          String(v ?? "").trim(),
        );
        if (!values.some((v) => v !== "")) continue;
        const warnings = [];
        if (typeof mapping.maxCount === "number" && values.length > mapping.maxCount) {
          warnings.push(
            `${values.length}件ありますが、カイポケ側は${mapping.maxCount}行までです。` +
              `${mapping.maxCount + 1}件目以降は入力されません。`,
          );
        }
        result.push({ key: mapping.key, label: mapping.label, values, mapping, warnings });
        continue;
      }
      const raw = mapping.toValue ? mapping.toValue(draft, options) : getValue(draft, mapping.key);
      const value = String(raw ?? "").trim();
      if (!value) continue;
      if (mapping.kind === "date") {
        result.push({
          key: mapping.key,
          label: mapping.label,
          value,
          mapping,
          parsedDate: parseJapaneseDate(value),
        });
        continue;
      }
      result.push({
        key: mapping.key,
        label: mapping.label,
        value,
        mapping,
        measure: measureText(value, mapping),
      });
    }
    return result;
  }

  // ---- 以降は DOM 依存（content script でのみ実行される） ----

  /**
   * 要素が画面に表示されているか（offsetParent 基準の簡易判定）。
   * @param {Element|null} el
   * @returns {boolean}
   */
  function isVisible(el) {
    if (!el) return false;
    const he = /** @type {HTMLElement} */ (el);
    return he.offsetParent !== null || he.getClientRects().length > 0;
  }

  /**
   * 直接の子テキストノードのみを連結して返す（子孫の大量テキストを除外）。
   * @param {Element} el
   * @returns {string}
   */
  function directText(el) {
    let s = "";
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) s += node.textContent || "";
    }
    return s.trim();
  }

  /**
   * 見出し要素の近傍からテキスト入力欄（textarea / text input）を探す。
   * 同一行(tr) → 親要素の順に querySelector する best-effort 探索。
   * @param {Element} labelEl
   * @returns {HTMLTextAreaElement|HTMLInputElement|null}
   */
  function nearestField(labelEl) {
    const selector = "textarea, input[type='text']";
    const row = labelEl.closest("tr");
    if (row) {
      const inRow = row.querySelector(selector);
      if (isVisible(inRow)) return /** @type {HTMLTextAreaElement} */ (inRow);
    }
    let parent = labelEl.parentElement;
    for (let depth = 0; parent && depth < 3; depth++) {
      const found = parent.querySelector(selector);
      if (isVisible(found)) return /** @type {HTMLTextAreaElement} */ (found);
      parent = parent.parentElement;
    }
    return null;
  }

  /**
   * 見出しラベル文言から近接の入力欄を探す（name難読化欄のフォールバック）。
   * @param {string} labelText
   * @returns {HTMLTextAreaElement|HTMLInputElement|null}
   */
  function findByLabel(labelText) {
    const candidates = document.querySelectorAll("th, td, label, dt, span, div, p");
    for (const node of candidates) {
      if (!directText(node).includes(labelText)) continue;
      const field = nearestField(node);
      if (field) return field;
    }
    return null;
  }

  /**
   * name から入力欄を探す（form: 接頭辞の有無を両方試す）。
   * @param {string[]} names
   * @returns {HTMLTextAreaElement|HTMLInputElement|null}
   */
  function findByName(names) {
    for (const name of names) {
      const variants = name.startsWith("form:") ? [name, name.slice(5)] : [name, `form:${name}`];
      for (const v of variants) {
        const els = document.getElementsByName(v);
        for (const el of els) {
          if (isVisible(el)) return /** @type {HTMLTextAreaElement} */ (el);
        }
      }
    }
    return null;
  }

  /**
   * マッピングに従って入力欄要素を解決する（name優先 → ラベル近接探索）。
   * @param {FieldMapping} mapping
   * @returns {HTMLTextAreaElement|HTMLInputElement|null}
   */
  function findField(mapping) {
    const byName = findByName(mapping.names || []);
    if (byName) return byName;
    if (mapping.labelText) return findByLabel(mapping.labelText);
    return null;
  }

  /**
   * name から select 要素を探す（form: 接頭辞の有無を両方試す）。
   * @param {string} name
   * @returns {HTMLSelectElement|null}
   */
  function findSelectByName(name) {
    const variants = name.startsWith("form:") ? [name, name.slice(5)] : [name, `form:${name}`];
    for (const v of variants) {
      const els = document.getElementsByName(v);
      for (const el of els) {
        if (el.tagName === "SELECT" && isVisible(el)) return /** @type {HTMLSelectElement} */ (el);
      }
    }
    return null;
  }

  /**
   * select の option を選んで change を発火する（JSF互換）。
   * @param {HTMLSelectElement} el
   * @param {(option: HTMLOptionElement) => boolean} match
   * @returns {boolean} 一致する option が無ければ false（値は変更しない）
   */
  function setSelectOption(el, match) {
    for (const option of el.options) {
      if (!match(option)) continue;
      el.value = option.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  }

  /**
   * 数値一致で option を選ぶ（年・月・日セレクト用。"07" 等のゼロ詰め表記も一致させる）。
   * @param {HTMLSelectElement} el
   * @param {number} n
   * @returns {boolean}
   */
  function setSelectByNumber(el, n) {
    return setSelectOption(
      el,
      (option) => Number.parseInt(option.value, 10) === n || Number.parseInt(option.text, 10) === n,
    );
  }

  /**
   * 表示文言の一致で option を選ぶ（元号セレクト用。value のコード体系は画面依存のため見ない）。
   * @param {HTMLSelectElement} el
   * @param {string} eraText - "令和" 等
   * @returns {boolean}
   */
  function setSelectByEraText(el, eraText) {
    return setSelectOption(el, (option) => (option.text || "").includes(eraText));
  }

  /**
   * "form:xxxYmd" ＋ {Era,Year,Month,Day} の4分割日付セレクトへ書き込む。
   * 年なし（M/D）は年号・年を触らず月日のみ。解析不能な日付は書かずに skipped を返す
   * （人が手でセレクトを選ぶ ── docs/KAIPOKE-DOM.md「追加マッピング方針」）。
   * @param {string} baseName - 例 "form:holdingMeetingYmd"
   * @param {string} dateStr
   * @returns {{status:"written"|"skipped"|"not_found", warnings:string[], elements:HTMLElement[]}}
   */
  function writeDateSelects(baseName, dateStr) {
    const parsed = parseJapaneseDate(dateStr);
    if (!parsed) {
      return {
        status: "skipped",
        warnings: [
          `日付「${dateStr}」を解析できなかったため、日付セレクトは手で選択してください。`,
        ],
        elements: [],
      };
    }
    const eraEl = findSelectByName(`${baseName}Era`);
    const yearEl = findSelectByName(`${baseName}Year`);
    const monthEl = findSelectByName(`${baseName}Month`);
    const dayEl = findSelectByName(`${baseName}Day`);
    if (!monthEl || !dayEl) {
      return { status: "not_found", warnings: [], elements: [] };
    }
    const warnings = [];
    const elements = [];
    if (parsed.era !== null && parsed.eraYear !== null) {
      if (eraEl && setSelectByEraText(eraEl, parsed.era)) {
        elements.push(eraEl);
      } else {
        warnings.push(`年号「${parsed.era}」を選択できませんでした（手で選択してください）。`);
      }
      if (yearEl && setSelectByNumber(yearEl, parsed.eraYear)) {
        elements.push(yearEl);
      } else {
        warnings.push(`年「${parsed.eraYear}」を選択できませんでした（手で選択してください）。`);
      }
    } else {
      warnings.push("年の指定が無いため、年号・年のセレクトは変更していません。");
    }
    if (setSelectByNumber(monthEl, parsed.month)) {
      elements.push(monthEl);
    } else {
      warnings.push(`月「${parsed.month}」を選択できませんでした。`);
    }
    if (setSelectByNumber(dayEl, parsed.day)) {
      elements.push(dayEl);
    } else {
      warnings.push(`日「${parsed.day}」を選択できませんでした。`);
    }
    return { status: "written", warnings, elements };
  }

  /**
   * 連番欄の開始番号（0始まりか1始まりか）を実画面から自動判定する。
   * 2026-07-19 の実機検証で第4表の出席者欄が0始まりでは見つからなかったため、
   * 固定の0始まりをやめ、実在する方を採用する（どちらも無ければ null）。
   * @param {string} baseName
   * @returns {number | null}
   */
  function detectSequentialStart(baseName) {
    for (const start of [0, 1]) {
      if (findByName([`${baseName}${start}`])) return start;
    }
    return null;
  }

  /**
   * 連番欄（"form:xxx0".. または "form:xxx1"..）へ配列を書き込む
   * （第4表 出席者・モニタリング目標評価用）。開始番号は実画面から自動判定。
   * 行の対応関係を保つため、空文字の行もそのまま書く（値の詰め直しはしない）。
   * @param {string} baseName - 例 "form:conventionAttendancePersonFullName"
   * @param {string[]} values
   * @returns {{found:number, missing:number[], elements:HTMLElement[]}} missing は行番号（配列添字）
   */
  function writeSequentialFields(baseName, values) {
    const report = { found: 0, missing: [], elements: [] };
    const start = detectSequentialStart(baseName);
    if (start === null) {
      for (let i = 0; i < values.length; i++) report.missing.push(i);
      return report;
    }
    for (let i = 0; i < values.length; i++) {
      const el = findByName([`${baseName}${start + i}`]);
      if (!el) {
        report.missing.push(i);
        continue;
      }
      writeField(el, values[i]);
      report.elements.push(el);
      report.found++;
    }
    return report;
  }

  /**
   * 入力欄を一時的にハイライトして、人が「何が入ったか」を目視確認できるようにする（F7）。
   * @param {HTMLElement} el
   * @param {"filled"|"caution"} kind
   */
  function highlight(el, kind) {
    const color = kind === "caution" ? "#f59e0b" : "#16a34a";
    const prevOutline = el.style.outline;
    const prevTransition = el.style.transition;
    el.style.transition = "background-color 1.2s ease";
    el.style.outline = `2px solid ${color}`;
    el.style.backgroundColor = kind === "caution" ? "#fef3c7" : "#dcfce7";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      el.style.backgroundColor = "";
    }, 80);
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.transition = prevTransition;
    }, 2400);
  }

  /**
   * 入力欄へ値を書き込む。JSF/React 双方のリスナを発火させるため、
   * ネイティブ value セッター経由で代入してから input/change を dispatch する。
   * @param {HTMLTextAreaElement|HTMLInputElement} el
   * @param {string} value
   */
  function writeField(el, value) {
    el.focus();
    const proto =
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor?.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.blur();
  }

  /** 欄が見つからない＝開いている画面が違う可能性が高い時の共通メッセージ。 */
  const NOT_FOUND_NOTE =
    "この画面に該当欄が見つかりませんでした（対象の編集画面を開いてください）。";

  /**
   * 開いているカイポケ画面へ、流し込み可能なフィールドを書き込む。
   * 見つからない欄は「画面が違う」可能性が高いので not_found として返し、書込はしない。
   * 保存・確定はしない（SPEC F7）。
   * @param {string} documentType
   * @param {Record<string, unknown>} draft
   * @param {InjectOptions} [options] - supportLog は entryIndex で「何件目のエントリを書くか」を指定
   * @returns {{filled:number, results:{label:string,status:string,note?:string,warnings?:string[]}[]}}
   */
  function inject(documentType, draft, options) {
    const fields = selectInjectableFields(documentType, draft, options);
    const results = [];
    let filled = 0;
    for (const f of fields) {
      const kind = f.mapping.confidence === "caution" ? "caution" : "filled";

      if (f.mapping.kind === "date") {
        const rep = writeDateSelects(f.mapping.baseName, f.value);
        if (rep.status === "not_found") {
          results.push({ label: f.label, status: "not_found", note: NOT_FOUND_NOTE });
          continue;
        }
        if (rep.status === "skipped") {
          results.push({
            label: f.label,
            status: "caution",
            note: f.mapping.note,
            warnings: rep.warnings,
          });
          continue;
        }
        for (const el of rep.elements) highlight(el, kind);
        filled++;
        results.push({
          label: f.label,
          status: kind,
          note: f.mapping.note,
          warnings: rep.warnings,
        });
        continue;
      }

      if (f.mapping.kind === "sequential") {
        const limit = typeof f.mapping.maxCount === "number" ? f.mapping.maxCount : f.values.length;
        const rep = writeSequentialFields(f.mapping.baseName, f.values.slice(0, limit));
        if (rep.found === 0) {
          results.push({ label: f.label, status: "not_found", note: NOT_FOUND_NOTE });
          continue;
        }
        const warnings = [...(f.warnings || [])];
        if (rep.missing.length > 0) {
          warnings.push(
            `${rep.missing.map((i) => i + 1).join("・")}行目の欄が見つからず入力していません。`,
          );
        }
        for (const el of rep.elements) highlight(el, kind);
        filled++;
        results.push({ label: f.label, status: kind, note: f.mapping.note, warnings });
        continue;
      }

      const el = findField(f.mapping);
      if (!el) {
        results.push({ label: f.label, status: "not_found", note: NOT_FOUND_NOTE });
        continue;
      }
      writeField(el, f.value);
      highlight(el, kind);
      filled++;
      results.push({
        label: f.label,
        status: kind,
        note: f.mapping.note,
        warnings: f.measure.warnings,
      });
    }
    return { filled, results };
  }

  return {
    FIELD_MAPS,
    INJECTABLE_TYPES,
    charWidth,
    lineFullWidth,
    measureText,
    getValue,
    parseJapaneseDate,
    toWareki,
    formatAttendeeAffiliation,
    discussionItemsText,
    discussionDetailsText,
    supportLogEntryAt,
    supportLogEntryToText,
    goalEvaluationToText,
    selectInjectableFields,
    findField,
    writeField,
    writeDateSelects,
    writeSequentialFields,
    inject,
  };
});
