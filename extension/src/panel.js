/**
 * サイドパネルのUI制御（P2 Step1 転記支援 ＋ Step2 流し込みの起点）。
 *
 * なぜ存在するか:
 *   面談メモから下書きを生成し（/api/extension/generate をトークンで呼ぶ）、
 *   帳票をフィールド単位で表示し、(1)ワンクリックコピー（どのソフトでも使える転記支援）と
 *   (2)カイポケ画面への流し込み（content.js へ依頼）を提供する。
 *
 * 何と繋がるか:
 *   - 生成: POST {baseUrl}/api/extension/generate（Bearer = options で設定したトークン）。
 *   - 流し込み: chrome.tabs.sendMessage(activeTab, {type:"CARENOTE_INJECT"}) → content.js。
 *   - 設定: chrome.storage.local（carenote:config / carenote:draft）。
 *
 * プライバシー（SPEC §7 / §12）:
 *   - 下書きはローカル（chrome.storage.local）にのみ保存。外部送信は生成API（自分のバックエンド）だけ。
 *   - カイポケ画面の内容は読み取らない／外部送信しない。
 */
(() => {
  const CONFIG_KEY = "carenote:config";
  const DRAFT_KEY = "carenote:draft";

  /** documentType → 生成APIへ送る入力フィールド定義（clientInfo は全種共通で先頭に付与）。 */
  const INPUT_SPECS = {
    assessment: [{ name: "assessmentNotes", label: "面談メモ・収集した情報", required: true }],
    carePlan: [{ name: "assessmentNotes", label: "アセスメント結果・面談メモ", required: true }],
    monitoring: [
      { name: "previousPlanSummary", label: "前回ケアプラン（目標・サービス）", required: true },
      { name: "monitoringNotes", label: "最新の状況・モニタリングメモ", required: true },
    ],
    meetingSummary: [{ name: "meetingNotes", label: "担当者会議のメモ", required: true }],
    supportLog: [{ name: "supportNotes", label: "支援の対応メモ", required: true }],
  };

  /** カイポケ流し込み対象フィールド → パネル表示用ヒント（adapters/kaipoke.js と対応）。 */
  const INJECT_HINTS = {
    assessment: {
      mainComplaints: "→ カイポケ: 主訴（本人）欄 ※家族分は手作業で分割",
      lifeHistory: "→ カイポケ: 生活歴・経過",
      overview: "→ カイポケ: 全体のまとめ（P10）",
    },
    carePlan: {
      assessmentSummary: "→ カイポケ: 意向を踏まえた課題分析の結果（第1表）",
      comprehensivePolicy: "→ カイポケ: 総合的な援助の方針（第1表）",
    },
  };

  const $ = (id) => document.getElementById(id);

  /** 現在のパネル状態（最後に読み込んだ下書き）。 */
  let current = { documentType: "assessment", draft: null };

  // ---- ストレージ ----

  async function getConfig() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    return data[CONFIG_KEY] || { baseUrl: "", token: "" };
  }

  async function saveDraft() {
    await chrome.storage.local.set({ [DRAFT_KEY]: current });
  }

  async function loadDraft() {
    const data = await chrome.storage.local.get(DRAFT_KEY);
    const saved = data[DRAFT_KEY];
    if (saved?.draft) {
      current = saved;
      $("doctype").value = saved.documentType;
    }
  }

  // ---- 入力フォーム ----

  function renderInputFields() {
    const documentType = $("doctype").value;
    const specs = [
      { name: "clientInfo", label: "利用者の基本情報（任意）", required: false },
      ...(INPUT_SPECS[documentType] || []),
    ];
    const wrap = $("input-fields");
    wrap.innerHTML = "";
    for (const spec of specs) {
      const label = document.createElement("label");
      label.className = "field-label";
      label.textContent = spec.label + (spec.required ? " *" : "");
      label.htmlFor = `in-${spec.name}`;
      const ta = document.createElement("textarea");
      ta.className = "textarea";
      ta.id = `in-${spec.name}`;
      ta.dataset.name = spec.name;
      ta.rows = spec.name === "clientInfo" ? 2 : 5;
      wrap.append(label, ta);
    }
  }

  // ---- 生成 ----

  function setMessage(text, kind) {
    const m = $("input-message");
    m.textContent = text || "";
    m.className = `message${kind ? ` ${kind}` : ""}`;
  }

  async function onGenerate() {
    const documentType = $("doctype").value;
    const config = await getConfig();
    if (!config.baseUrl || !config.token) {
      setMessage("先に「設定」でAPIのURLと拡張トークンを登録してください。", "error");
      return;
    }

    const body = { documentType };
    let missing = false;
    for (const ta of $("input-fields").querySelectorAll("textarea")) {
      const value = ta.value.trim();
      if (value) body[ta.dataset.name] = value;
      const spec = (INPUT_SPECS[documentType] || []).find((s) => s.name === ta.dataset.name);
      if (spec?.required && !value) missing = true;
    }
    if (missing) {
      setMessage("必須項目（*）を入力してください。", "error");
      return;
    }

    setMessage("生成中…（数十秒かかることがあります）");
    $("generate").disabled = true;
    try {
      const base = config.baseUrl.replace(/\/+$/, "");
      const res = await fetch(`${base}/api/extension/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data?.error || `生成に失敗しました（HTTP ${res.status}）。`, "error");
        return;
      }
      current = { documentType, draft: data };
      await saveDraft();
      renderResult();
      setMessage("下書きを生成しました。", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`通信に失敗しました: ${msg}`, "error");
    } finally {
      $("generate").disabled = false;
    }
  }

  function onLoadJson() {
    const raw = $("paste-json").value.trim();
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setMessage("JSONの形式が正しくありません。", "error");
      return;
    }
    const documentType = $("doctype").value;
    current = { documentType, draft: parsed };
    saveDraft();
    renderResult();
    setMessage("貼り付けた下書きを読み込みました。", "success");
  }

  // ---- 帳票テキスト整形（lib/draftText.ts と対応） ----

  function numbered(items) {
    return (items || []).map((s, i) => `${i + 1}. ${s}`).join("\n");
  }

  function toSections(documentType, d) {
    if (!d) return [];
    switch (documentType) {
      case "assessment":
        return [
          { label: "今回のアセスメントの理由", text: d.assessmentReason },
          { label: "主訴・意向", text: d.mainComplaints, key: "mainComplaints" },
          {
            label: "これまでの生活と現在の状況（生活歴）",
            text: d.lifeHistory,
            key: "lifeHistory",
          },
          { label: "現在利用している支援・社会資源", text: d.currentServices },
          { label: "全体像", text: d.overview, key: "overview" },
          {
            label: "課題分析14項目（標準項目準拠）",
            text: (d.domains || [])
              .map((x) => `■ ${x.domain}\n  現状: ${x.currentStatus}\n  分析: ${x.analysis}`)
              .join("\n"),
          },
          {
            label: "強み（ストレングス）",
            text: (d.strengths || []).map((s) => `・${s}`).join("\n"),
          },
          { label: "抽出された生活課題の候補", text: numbered(d.identifiedIssues) },
        ];
      case "carePlan":
        return [
          { label: "利用者及び家族の意向", text: d.intentions },
          {
            label: "意向を踏まえた課題分析の結果",
            text: d.assessmentSummary,
            key: "assessmentSummary",
          },
          { label: "総合的な援助の方針", text: d.comprehensivePolicy, key: "comprehensivePolicy" },
          {
            label: "生活全般の解決すべき課題（ニーズ）",
            text: (d.needs || [])
              .map((n, i) => {
                const services = (n.services || [])
                  .map(
                    (s) =>
                      `   - ${s.content} / ${s.serviceType} / ${s.frequency} / ${s.period} / 担当: ${s.provider}`,
                  )
                  .join("\n");
                return `${i + 1}. ${n.need}\n   長期目標: ${n.longTermGoal}（${n.longTermPeriod}）\n   短期目標: ${n.shortTermGoal}（${n.shortTermPeriod}）\n${services}`;
              })
              .join("\n\n"),
          },
        ];
      case "monitoring":
        return [
          { label: "総合所見", text: d.overallSummary },
          {
            label: "目標ごとの達成状況",
            text: (d.goalEvaluations || [])
              .map(
                (g, i) =>
                  `${i + 1}. ${g.goal}\n   達成状況: ${g.achievement}\n   根拠: ${g.evidence}\n   提案: ${g.proposal}`,
              )
              .join("\n\n"),
          },
          { label: "プラン全体の判断", text: d.planRecommendation },
        ];
      case "meetingSummary":
        return [
          {
            label: "会議情報",
            text: `開催日: ${d.meetingDate}\n場所: ${d.meetingPlace}\n時間: ${d.meetingTime}`,
          },
          {
            label: "出席者",
            text: (d.attendees || [])
              .map((a) => `・${a.affiliation}（${a.role}） ${a.name}`)
              .join("\n"),
          },
          {
            label: "検討した項目・検討内容",
            text: (d.discussions || [])
              .map((x, i) => `${i + 1}. ${x.item}\n   ${x.details}`)
              .join("\n\n"),
          },
          { label: "結論", text: d.conclusion },
          { label: "残された課題（次回の開催時期）", text: d.remainingIssues },
        ];
      case "supportLog":
        return (d.entries || []).map((e, i) => ({
          label: `支援経過 ${i + 1}: ${e.date}（${e.category}）`,
          text: `【対応内容】${e.action}\n【背景・理由】${e.background}\n【事実・発言】${e.factsAndStatements}\n【アセスメント・判断】${e.judgement}\n【今後の対応】${e.nextAction}`,
        }));
      default:
        return [];
    }
  }

  // ---- 結果レンダリング ----

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = "コピーしました";
      setTimeout(() => {
        btn.textContent = original;
      }, 1200);
    } catch {
      btn.textContent = "コピー失敗";
    }
  }

  function makeSection(documentType, section) {
    const card = document.createElement("section");
    card.className = "section";

    const head = document.createElement("div");
    head.className = "section-head";
    const label = document.createElement("span");
    label.className = "section-label";
    label.textContent = section.label;
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn";
    copyBtn.type = "button";
    copyBtn.textContent = "コピー";
    copyBtn.addEventListener("click", () => copyText(section.text || "", copyBtn));
    head.append(label, copyBtn);

    const body = document.createElement("p");
    body.className = "section-body";
    body.textContent = section.text || "（記載なし）";

    card.append(head, body);

    const hint = section.key && INJECT_HINTS[documentType]?.[section.key];
    if (hint) {
      const h = document.createElement("span");
      h.className = "inject-hint";
      h.textContent = hint;
      card.append(h);
    }
    return card;
  }

  function renderConfirmBlock(items) {
    const wrap = $("confirm-block");
    wrap.innerHTML = "";
    if (!items || items.length === 0) return;
    const card = document.createElement("div");
    card.className = "confirm-card";
    const h = document.createElement("h3");
    h.textContent = "要確認事項（ケアマネが確認してください）";
    const ul = document.createElement("ul");
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item;
      ul.append(li);
    }
    card.append(h, ul);
    wrap.append(card);
  }

  function renderResult() {
    const { documentType, draft } = current;
    if (!draft) {
      $("result").hidden = true;
      $("inject-card").hidden = true;
      return;
    }
    $("client-name").textContent = draft.clientName ? `利用者: ${draft.clientName}` : "";
    const sectionsWrap = $("sections");
    sectionsWrap.innerHTML = "";
    for (const section of toSections(documentType, draft)) {
      sectionsWrap.append(makeSection(documentType, section));
    }
    renderConfirmBlock(draft.itemsToConfirm);
    $("result").hidden = false;

    // 流し込みカードは対応帳票のときだけ表示
    const injectable = Boolean(INJECT_HINTS[documentType]);
    $("inject-card").hidden = !injectable;
    if (injectable) refreshTabStatus();
  }

  function copyAll() {
    const parts = toSections(current.documentType, current.draft).map(
      (s) => `【${s.label}】\n${s.text || ""}`,
    );
    if (current.draft?.itemsToConfirm?.length) {
      parts.push(`【要確認事項】\n${current.draft.itemsToConfirm.map((i) => `・${i}`).join("\n")}`);
    }
    copyText(parts.join("\n\n"), $("copy-all"));
  }

  // ---- 流し込み（content.js と往復） ----

  async function getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  async function refreshTabStatus() {
    const badge = $("tab-status");
    const btn = $("inject");
    try {
      const tab = await getActiveTab();
      if (!tab || !/^https:\/\/r\.kaipoke\.biz\//.test(tab.url || "")) {
        badge.textContent = "カイポケ未表示";
        badge.className = "badge off";
        btn.disabled = true;
        return;
      }
      const res = await chrome.tabs.sendMessage(tab.id, { type: "CARENOTE_PING" });
      if (res?.ok && res.adapterReady) {
        badge.textContent = "カイポケ接続OK";
        badge.className = "badge ok";
        btn.disabled = false;
      } else {
        badge.textContent = "再読込が必要";
        badge.className = "badge off";
        btn.disabled = true;
      }
    } catch {
      badge.textContent = "カイポケ未表示";
      badge.className = "badge off";
      btn.disabled = true;
    }
  }

  function renderReport(report) {
    const wrap = $("inject-report");
    wrap.innerHTML = "";
    if (!report?.results) return;
    for (const r of report.results) {
      const item = document.createElement("div");
      item.className = `report-item ${r.status}`;
      const icon = r.status === "filled" ? "✅" : r.status === "caution" ? "⚠️" : "—";
      const notes = [r.note, ...(r.warnings || [])].filter(Boolean).join(" / ");
      item.textContent = `${icon} ${r.label}${notes ? `：${notes}` : ""}`;
      wrap.append(item);
    }
    const summary = document.createElement("div");
    summary.className = "hint";
    summary.textContent = `${report.filled}件を入力しました。内容を確認のうえ、カイポケで保存してください。`;
    wrap.append(summary);
  }

  async function onInject() {
    const btn = $("inject");
    btn.disabled = true;
    try {
      const tab = await getActiveTab();
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: "CARENOTE_INJECT",
        documentType: current.documentType,
        draft: current.draft,
      });
      if (res?.ok) {
        renderReport(res.report);
      } else {
        $("inject-report").textContent = res?.error || "流し込みに失敗しました。";
      }
    } catch {
      $("inject-report").textContent =
        "カイポケ画面と通信できませんでした。対象の編集画面を開いて、ページを再読込してください。";
    } finally {
      btn.disabled = false;
    }
  }

  async function onClear() {
    current = { documentType: $("doctype").value, draft: null };
    await chrome.storage.local.remove(DRAFT_KEY);
    $("sections").innerHTML = "";
    $("confirm-block").innerHTML = "";
    $("inject-report").innerHTML = "";
    renderResult();
    setMessage("下書きを消去しました。");
  }

  // ---- 初期化 ----

  function init() {
    renderInputFields();
    $("doctype").addEventListener("change", () => {
      current.documentType = $("doctype").value;
      renderInputFields();
      renderResult();
    });
    $("generate").addEventListener("click", onGenerate);
    $("load-json").addEventListener("click", onLoadJson);
    $("copy-all").addEventListener("click", copyAll);
    $("clear").addEventListener("click", onClear);
    $("inject").addEventListener("click", onInject);
    $("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());

    loadDraft().then(renderResult);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
