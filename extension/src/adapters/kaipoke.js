/**
 * カイポケ・アダプタ（P2 Step2 半自動入力の中核）。
 *
 * なぜ存在するか:
 *   CareNote AI が生成した下書き（AssessmentDraft / CarePlanDraft 等）を、
 *   カイポケ（r.kaipoke.biz・JSF系画面）の帳票テキスト欄へ「流し込む」ための
 *   マッピングと書込ロジックを一箇所に集約する。フィールド名はすべて
 *   docs/KAIPOKE-DOM.md（2026-06-12 実環境取得）に基づく。推測値は置かない（§2.6-A）。
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
   * @property {string} key - CareNote下書きのフィールドキー
   * @property {string} label - 表示・レポート用の日本語ラベル
   * @property {string[]} names - 候補となる input/textarea の name（form:接頭辞込み）
   * @property {string} [labelText] - name で見つからない時に近接探索するラベル文言
   * @property {number} [maxRows] - テキストエリアの最大行数（超過は警告のみ）
   * @property {number} [maxColsFullWidth] - 1行あたりの全角文字数上限（超過は警告のみ）
   * @property {"clean"|"caution"} [confidence] - caution=要人手確認（曖昧マッピング）
   * @property {string} [note] - 要確認の理由など、人へのメッセージ
   */

  /**
   * documentType ごとの「CareNote下書き → カイポケ欄」マッピング。
   * 出典: docs/KAIPOKE-DOM.md（アセスメント P1/P10、ケアプラン第1表）。
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

  /**
   * documentType と下書きから「カイポケへ流し込めるフィールド」の一覧を作る（純粋関数・DOM非依存）。
   * 値が空のフィールドは除外する。
   * @param {string} documentType
   * @param {Record<string, unknown>} draft
   * @returns {{key:string,label:string,value:string,mapping:FieldMapping,measure:ReturnType<typeof measureText>}[]}
   */
  function selectInjectableFields(documentType, draft) {
    const maps = FIELD_MAPS[documentType] || [];
    const result = [];
    for (const mapping of maps) {
      const value = getValue(draft, mapping.key).trim();
      if (!value) continue;
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

  /**
   * 開いているカイポケ画面へ、流し込み可能なフィールドを書き込む。
   * 見つからない欄は「画面が違う」可能性が高いので not_found として返し、書込はしない。
   * 保存・確定はしない（SPEC F7）。
   * @param {string} documentType
   * @param {Record<string, unknown>} draft
   * @returns {{filled:number, results:{label:string,status:string,note?:string,warnings?:string[]}[]}}
   */
  function inject(documentType, draft) {
    const fields = selectInjectableFields(documentType, draft);
    const results = [];
    let filled = 0;
    for (const f of fields) {
      const el = findField(f.mapping);
      if (!el) {
        results.push({
          label: f.label,
          status: "not_found",
          note: "この画面に該当欄が見つかりませんでした（対象の編集画面を開いてください）。",
        });
        continue;
      }
      const kind = f.mapping.confidence === "caution" ? "caution" : "filled";
      writeField(el, f.value);
      highlight(el, kind);
      filled++;
      results.push({
        label: f.label,
        status: kind === "caution" ? "caution" : "filled",
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
    selectInjectableFields,
    findField,
    writeField,
    inject,
  };
});
