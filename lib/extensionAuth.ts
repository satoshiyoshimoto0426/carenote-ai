import { createHash, timingSafeEqual } from "node:crypto";

/**
 * 拡張API受け口（/api/extension/generate）の認可ロジック。純粋関数＝単体テスト対象。
 *
 * なぜ存在するか（ロードマップ G3 / R7）:
 *   受け口は Clerk セッションを持たない拡張のため Bearer トークンで守る。旧実装は
 *   「単一固定トークン × CORS `*`」で、漏洩すれば全経路が開き APIコストも暴走しうる穴だった。
 *   本モジュールで「複数トークン（利用者別・env で失効可）＋定数時間比較＋CORS許可リスト＋
 *   簡易レート制限」を提供する。DB を持たず env 駆動＝1社実証に見合う堅牢化（横断規約 §2.5-F）。
 *
 * 注意: このエンドポイントは利用者DB（clients/documents）を読まない。返すのは呼び出し側が
 *   与えたメモからの生成結果のみ。トークン漏洩の主リスクは「なりすまし生成＋APIコスト」。
 *   CORS は認証ではなく、ブラウザ経由の他オリジン悪用を狭める多層防御（実際の関門はトークン）。
 */

export interface ExtensionToken {
  /**
   * 監査ログ用のラベル（秘密ではない）。**実名（利用者名・ケアマネ名）は使わない**
   * ＝ログに残るため。擬名/コードにする（例: "cm01", "office-a"）。
   */
  label: string;
  /** Bearer の実値（秘密） */
  token: string;
}

/** 有効とみなすトークンの最小長（推測されやすい短い値を弾く。生成は randomBytes(24) 推奨）。 */
const MIN_TOKEN_LEN = 16;

/**
 * env からトークン群を読む。
 * - CARENOTE_EXTENSION_TOKENS: "ラベル:トークン" をカンマ区切りで複数（利用者別・推奨）
 * - CARENOTE_EXTENSION_TOKEN: 旧・単一トークン（後方互換。ラベル "default"）
 * 失効は env から該当行を削除して再デプロイするだけ。
 */
export function parseExtensionTokens(env: Record<string, string | undefined>): ExtensionToken[] {
  const result: ExtensionToken[] = [];
  const multi = env.CARENOTE_EXTENSION_TOKENS?.trim();
  if (multi) {
    for (const pair of multi.split(",")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      // コロン無しはラベル省略とみなす
      const label = idx > 0 ? trimmed.slice(0, idx).trim() : "unnamed";
      const token = (idx > 0 ? trimmed.slice(idx + 1) : trimmed).trim();
      // 短すぎるトークンは弾く（設定ミスで推測容易な値が有効化されるのを防ぐ）
      if (token.length >= MIN_TOKEN_LEN) result.push({ label, token });
    }
  }
  const single = env.CARENOTE_EXTENSION_TOKEN?.trim();
  if (single && single.length >= MIN_TOKEN_LEN) result.push({ label: "default", token: single });
  return result;
}

/** 定数時間で2文字列を比較（SHA-256 ダイジェスト同士＝長さ差の情報も漏らさない）。 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Authorization ヘッダから Bearer を取り出し、一致するトークンのラベルを返す（無ければ null）。 */
export function matchBearer(
  tokens: ExtensionToken[],
  authHeader: string | null | undefined,
): string | null {
  const header = authHeader ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!presented || tokens.length === 0) return null;
  // 早期 return しない（どのトークンにも一致しなくても全件比較＝タイミング差を抑える）
  let matchedLabel: string | null = null;
  for (const { label, token } of tokens) {
    if (safeEqual(presented, token)) matchedLabel = label;
  }
  return matchedLabel;
}

/**
 * CORS で反射してよいオリジンか判定し、許可時はそのオリジン文字列を返す（不許可は null）。
 * - chrome-extension:// スキームは許可（拡張本体）
 * - CARENOTE_EXTENSION_ORIGINS（カンマ区切り）に完全一致するものは許可（Web版デバッグ等）
 * - Origin 無し（curl/サーバ間）は CORS 非対象なので null（ヘッダを付けない）
 */
export function resolveCorsOrigin(
  origin: string | null | undefined,
  env: Record<string, string | undefined>,
): string | null {
  if (!origin) return null;
  if (origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
    return origin;
  }
  const allow = env.CARENOTE_EXTENSION_ORIGINS?.split(",").map((s) => s.trim()) ?? [];
  return allow.includes(origin) ? origin : null;
}

export interface RateState {
  hits: number[];
}

/**
 * 簡易スライディングウィンドウ・レート制限（純粋・store は呼び出し側が保持する Map）。
 * @returns limited=true なら上限超過。
 * 注意: サーバレスでは store はインスタンス単位（ウォームな間だけ）＝完全ではないが、
 *   単一トークンの暴走を抑える現実的な防御。恒久対策が要れば KV へ昇格（§2.5-F）。
 */
export function hitRateLimit(
  store: Map<string, RateState>,
  key: string,
  now: number,
  opts: { limit: number; windowMs: number },
): { limited: boolean; remaining: number } {
  const state = store.get(key) ?? { hits: [] };
  const cutoff = now - opts.windowMs;
  const recent = state.hits.filter((t) => t > cutoff);
  if (recent.length >= opts.limit) {
    store.set(key, { hits: recent });
    return { limited: true, remaining: 0 };
  }
  recent.push(now);
  store.set(key, { hits: recent });
  return { limited: false, remaining: opts.limit - recent.length };
}
