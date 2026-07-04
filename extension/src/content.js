/**
 * カイポケ画面に常駐するコンテンツスクリプト（P2 Step2）。
 *
 * なぜ存在するか:
 *   サイドパネル(panel.js)からのメッセージを受け、開いているカイポケ帳票画面の
 *   テキスト欄へ下書きを書き込む（実際のDOM操作の実行者）。書込ロジック自体は
 *   adapters/kaipoke.js（globalThis.CareNoteKaipoke）に集約されている。
 *
 * 何と繋がるか:
 *   - 上流: panel.js が chrome.tabs.sendMessage で {type:"CARENOTE_INJECT"} を送る。
 *   - 依存: 同じ content_scripts で先に読み込まれる adapters/kaipoke.js。
 *
 * セキュリティ（SPEC §12 / §7.1）:
 *   - カイポケ画面の内容を外部送信しない。読み取りは「欄の存在確認」に限定。
 *   - ログイン情報・Cookie を扱わない。既存のログインセッション上で動くだけ。
 */
(() => {
  const adapter = globalThis.CareNoteKaipoke;

  /** カイポケのアプリ本体画面かどうか（content_scripts の matches で既に絞られている前提の二重確認）。 */
  function isKaipokeApp() {
    return location.hostname.endsWith("kaipoke.biz");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return undefined;

    if (message.type === "CARENOTE_PING") {
      sendResponse({
        ok: true,
        isKaipoke: isKaipokeApp(),
        adapterReady: Boolean(adapter),
        url: location.href,
      });
      return undefined;
    }

    if (message.type === "CARENOTE_INJECT") {
      if (!adapter) {
        sendResponse({
          ok: false,
          error: "アダプタの初期化に失敗しました。ページを再読込してください。",
        });
        return undefined;
      }
      try {
        const report = adapter.inject(message.documentType, message.draft);
        sendResponse({ ok: true, report });
      } catch (e) {
        const messageText = e instanceof Error ? e.message : "流し込み中にエラーが発生しました。";
        sendResponse({ ok: false, error: messageText });
      }
      return undefined;
    }

    return undefined;
  });
})();
