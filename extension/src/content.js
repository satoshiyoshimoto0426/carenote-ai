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
        // セッション切れの再ログイン画面が出ていれば true（拡張は書き込まず、職員に再ログインを頼む）
        reloginRequired: Boolean(adapter?.isReloginRequired?.()),
        url: location.href,
      });
      return undefined;
    }

    // 書き込み系はすべて、再ログイン画面が出ていたら止める（docs/KAIPOKE-TRANSCRIPTION-SPEC.md §5-6）
    if (
      adapter?.isReloginRequired?.() &&
      /^CARENOTE_(INJECT|APPEND_PREVIEW|APPEND_APPLY|APPEND_UNDO)$/.test(message.type)
    ) {
      sendResponse({
        ok: false,
        error:
          "カイポケのログインが切れています（30分無操作）。カイポケで再ログインしてから、もう一度押してください。",
      });
      return undefined;
    }

    // 第5段: アセスメント欄への追記（前後の確認 → 退避して追記 → 取り消し）。保存はしない。
    if (
      message.type === "CARENOTE_APPEND_PREVIEW" ||
      message.type === "CARENOTE_APPEND_APPLY" ||
      message.type === "CARENOTE_APPEND_UNDO"
    ) {
      if (!adapter) {
        sendResponse({
          ok: false,
          error: "アダプタの初期化に失敗しました。ページを再読込してください。",
        });
        return undefined;
      }
      try {
        const fn =
          message.type === "CARENOTE_APPEND_PREVIEW"
            ? adapter.previewAppend
            : message.type === "CARENOTE_APPEND_APPLY"
              ? adapter.applyAppend
              : adapter.undoAppend;
        const report = fn(message.documentType, message.fieldKey, message.addition);
        sendResponse({ ok: true, report });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "追記中にエラーが発生しました。",
        });
      }
      return undefined;
    }

    // 第2表: 追加画面1つ分を埋める（画面遷移・登録は人）
    if (message.type === "CARENOTE_PLAN2_FILL") {
      if (!adapter) {
        sendResponse({
          ok: false,
          error: "アダプタの初期化に失敗しました。ページを再読込してください。",
        });
        return undefined;
      }
      try {
        sendResponse({ ok: true, report: adapter.fillPlan2Step(message.step) });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "第2表の流し込み中にエラーが発生しました。",
        });
      }
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
        // options: supportLog の entryIndex 等（adapters/kaipoke.js の InjectOptions）。
        const report = adapter.inject(message.documentType, message.draft, message.options);
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
