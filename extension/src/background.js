/**
 * バックグラウンド Service Worker（MV3）。
 *
 * なぜ存在するか:
 *   ツールバーのアイコンをクリックしたときにサイドパネルを開く設定を行う。
 *   MV3 ではこの挙動を setPanelBehavior で宣言する必要がある。
 *
 * 何と繋がるか:
 *   - action（manifest.json）クリック → サイドパネル(src/panel.html) を表示。
 *   - 流し込み等の実処理は panel.js ↔ content.js が直接メッセージ往復するため、
 *     ここではリレーを持たない（シンプルに保つ）。
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.error("[carenote] setPanelBehavior failed:", e));
});

// 起動時にも念のため設定（onInstalled が走らない再起動ケース対策）。
chrome.sidePanel
  ?.setPanelBehavior?.({ openPanelOnActionClick: true })
  .catch((e) => console.error("[carenote] setPanelBehavior failed:", e));
