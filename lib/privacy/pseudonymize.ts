/**
 * 仮名化（氏名⇄記号）の純粋ロジック。DOM/API/DB に依存しない（必ず単体テスト・機能仕様 §7）。
 *
 * なぜ存在するか:
 *   Claude API（海外）へは**記号のみ**を送るため、送信前に実名→記号へ置換する。
 *   画面表示時は権限内でのみ記号→実名に復元する。
 */

/** 実名と表示記号の対応。 */
export interface NameAlias {
  /** 実名（client_identities に暗号化保存。Claudeへは送らない） */
  real: string;
  /** 表示記号（例: "A様"。clients.code 由来） */
  code: string;
}

/**
 * テキスト中の実名を記号へ置換する。
 * 長い実名から先に置換し、姓だけが別名に巻き込まれる取りこぼしを防ぐ。
 */
export function maskNames(text: string, aliases: NameAlias[]): string {
  let out = text;
  for (const { real, code } of [...aliases].sort((a, b) => b.real.length - a.real.length)) {
    if (!real) continue;
    out = out.split(real).join(code);
  }
  return out;
}

/** テキスト中の記号を実名へ復元する（表示用・権限内でのみ使用）。 */
export function restoreNames(text: string, aliases: NameAlias[]): string {
  let out = text;
  for (const { real, code } of [...aliases].sort((a, b) => b.code.length - a.code.length)) {
    if (!code) continue;
    out = out.split(code).join(real);
  }
  return out;
}

/**
 * 連番から利用者コードを生成する（0→A, 1→B, …, 25→Z, 26→AA, 27→AB …）。
 * org 内の既存件数を渡して次のコードを決める。表示は別途「様」を付す。
 */
export function nextClientCode(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
