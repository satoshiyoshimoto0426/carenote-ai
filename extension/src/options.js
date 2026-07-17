/**
 * 設定画面（API URL・拡張トークンの保存と接続テスト）。
 *
 * なぜ存在するか:
 *   サイドパネルが /api/extension/generate を呼ぶための接続情報を、利用者が安全に登録する。
 *   トークンはこの端末の chrome.storage.local にのみ保存し、生成API以外へは送らない（SPEC §12）。
 *
 * 何と繋がるか:
 *   - 保存先: chrome.storage.local["carenote:config"] = { baseUrl, token }。panel.js が読む。
 *   - 接続テスト: 認証だけ確認するため、わざと空ボディを送り 400（＝認証通過）か 401 を判定する。
 */
(() => {
  const CONFIG_KEY = "carenote:config";
  const $ = (id) => document.getElementById(id);

  function setMessage(text, kind) {
    const m = $("message");
    m.textContent = text || "";
    m.className = `message${kind ? ` ${kind}` : ""}`;
  }

  function readForm() {
    return {
      baseUrl: $("baseUrl").value.trim().replace(/\/+$/, ""),
      token: $("token").value.trim(),
    };
  }

  async function load() {
    const data = await chrome.storage.local.get(CONFIG_KEY);
    const config = data[CONFIG_KEY] || { baseUrl: "", token: "" };
    $("baseUrl").value = config.baseUrl || "";
    $("token").value = config.token || "";
  }

  async function save() {
    const config = readForm();
    if (!config.baseUrl || !config.token) {
      setMessage("URLとトークンの両方を入力してください。", "error");
      return;
    }
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
    setMessage("保存しました。", "success");
  }

  async function test() {
    const config = readForm();
    if (!config.baseUrl || !config.token) {
      setMessage("URLとトークンを入力してから接続テストしてください。", "error");
      return;
    }
    setMessage("接続を確認中…");
    try {
      // 空ボディを送る: 認証OKなら入力不足で400、トークン不一致なら401が返る。
      const res = await fetch(`${config.baseUrl}/api/extension/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify({ documentType: "assessment" }),
      });
      if (res.status === 401) {
        setMessage("トークンが一致しません（401）。値を確認してください。", "error");
      } else if (res.status === 400 || res.ok) {
        setMessage("接続できました。トークンは有効です。", "success");
      } else {
        setMessage(`想定外の応答（HTTP ${res.status}）。URLを確認してください。`, "error");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessage(`接続に失敗しました: ${msg}`, "error");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    load();
    $("save").addEventListener("click", save);
    $("test").addEventListener("click", test);
  });
})();
