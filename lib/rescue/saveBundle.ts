/**
 * 救済モードで作った書類一式を、利用者へ1枚ずつ保存する（押し直しても二重にしない）。ブラウザから使う。
 *
 * なぜ存在するか（2026-09-24 検収の指摘・作り直し計画 S1）:
 *   保存は「（新しい利用者なら）利用者を作る → 5帳票を1枚ずつ POST /api/documents」の順に進む。
 *   以前は作った利用者の id を関数の中の変数にしか持たず、途中の1枚が失敗して職員が押し直すと、
 *   **もう1人同じ方を作り**、保存済みの帳票も**もう一度**保存していた（一式が2人の利用者に分かれる）。
 *   失敗の文言（例: 利用者を読めなかったときの 503「少し待ってから、もう一度お試しください」）が
 *   まさに押し直しを勧めるので、押し直しは必ず起きる。そこで途中経過（保存先と保存済みの帳票）を
 *   呼ぶ側へ1歩ごとに渡し、押し直しでは同じ利用者へ、まだの帳票だけを保存する。
 *
 * 何と繋がるか:
 *   呼ぶ画面 = app/(dashboard)/rescue/page.tsx の保存パネル（途中経過を state に持つ）。
 *   通信先 = POST /api/clients（新しい利用者）・POST /api/documents（source: "rescue"）。
 *   検査 = lib/rescue/saveBundle.test.ts（関数）・tests/ui/clientListErrors.live.test.tsx（画面で押し直す）。
 */

/**
 * 保存の途中経過。1歩進むたびに新しいオブジェクトで作り直す（画面の state にそのまま入れるため）。
 * @typeParam K 帳票の種類（救済モードでは RescueBundle のキー）
 */
export interface BundleSaveProgress<K extends string> {
  /** 保存先の利用者 id。ここに決まったら、押し直しても変えない */
  clientId: string;
  /** 保存先の記号（A など）。画面の「どこへ保存しているか」の表示用。分からなければ null */
  clientCode: string | null;
  /** この保存で新しく作った利用者か（作ったなら、押し直しでもう1人作らない） */
  createdClient: boolean;
  /** 保存が済んだ帳票（押し直しでは、これ以外だけを保存する） */
  savedKeys: K[];
}

/** 失敗した応答から職員向けの文を取り出す。本文が JSON でなければ代わりの文にする。 */
async function errorOf(resp: Response, fallback: string): Promise<string> {
  try {
    const data = (await resp.json()) as { error?: unknown };
    return typeof data.error === "string" && data.error !== "" ? data.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 一式を保存する。途中で失敗したら Error（職員向けの文）を投げる。それまでに進んだ分は onProgress で渡し済み。
 *
 * @param params.progress 前回の途中経過。あれば保存先はそこに固定し（targetClientId・newClientName は見ない）、
 *   savedKeys にある帳票は送らない。無ければ targetClientId（空なら新しい利用者を作る）から始める。
 * @param params.targetClientCode targetClientId の記号（画面の一覧から分かるとき）。
 * @param params.onProgress 1歩進むたびに呼ぶ。呼ぶ側はこれを次の押し直しの progress に渡す。
 * @returns 全部の帳票を保存し終えた途中経過（savedKeys がすべての keys を含む）。
 */
export async function saveBundleDocuments<K extends string>(params: {
  bundle: Record<K, unknown>;
  keys: readonly K[];
  targetClientId: string;
  targetClientCode?: string | null;
  newClientName: string;
  progress: BundleSaveProgress<K> | null;
  onProgress: (progress: BundleSaveProgress<K>) => void;
  fetchImpl?: typeof fetch;
}): Promise<BundleSaveProgress<K>> {
  const send = params.fetchImpl ?? fetch;
  const post = (url: string, body: unknown) =>
    send(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let progress = params.progress;
  if (!progress) {
    if (params.targetClientId) {
      progress = {
        clientId: params.targetClientId,
        clientCode: params.targetClientCode ?? null,
        createdClient: false,
        savedKeys: [],
      };
    } else {
      const resp = await post("/api/clients", { name: params.newClientName.trim() || undefined });
      if (!resp.ok) throw new Error(await errorOf(resp, "利用者の作成に失敗しました"));
      const created = (await resp.json()) as { id?: unknown; code?: unknown };
      if (typeof created.id !== "string" || created.id === "") {
        throw new Error("利用者の作成に失敗しました");
      }
      progress = {
        clientId: created.id,
        clientCode: typeof created.code === "string" ? created.code : null,
        createdClient: true,
        savedKeys: [],
      };
    }
    // 利用者を作った直後に渡す: この後の1枚目で失敗しても、押し直しで同じ利用者へ保存できるように
    params.onProgress(progress);
  }

  for (const key of params.keys) {
    if (progress.savedKeys.includes(key)) continue;
    const resp = await post("/api/documents", {
      clientId: progress.clientId,
      docType: key,
      content: params.bundle[key],
      source: "rescue",
    });
    if (!resp.ok) throw new Error(await errorOf(resp, "保存に失敗しました"));
    progress = { ...progress, savedKeys: [...progress.savedKeys, key] };
    params.onProgress(progress);
  }
  return progress;
}
