import type { ClientRecord } from "@/types/client";

/**
 * 利用者の一覧（A案「作業台」の表）で使う、画面を持たない決まりをまとめた純粋な関数。
 *
 * なぜ分けたか:
 *   一覧の表（components/clients/ClientTable.tsx）・一覧の外枠（components/clients/ClientsLayout.tsx）・
 *   利用者の詳細（app/(dashboard)/clients/[id]/page.tsx）が同じ「属性の1行」「探し方」「選んでいる利用者」を使う。
 *   以前は属性の1行を画面ごとに別々に書いていた（clients/page.tsx と clients/[id]/page.tsx）。
 *   画面を描かずに確かめられるよう、ここに純粋な関数として置く（テスト: lib/clients/clientList.test.ts）。
 *
 * 実名は扱わない: ClientRecord は氏名を持たない（氏名は client_identities に暗号化して置く ── lib/db/clients.ts）。
 * ここで作る文字は、記号（A様）・属性（年齢・性別・要介護度・世帯）・登録日だけ。
 */

/**
 * 属性を「85歳・女性・要介護2・独居」の1行にする（A-clients のアートボードの区切り「・」）。
 * 空の項目は飛ばし、何も無ければ空文字を返す（画面は「（属性未設定）」と出す）。
 */
export function clientAttrLine(client: Pick<ClientRecord, "attributes">): string {
  const a = client.attributes ?? {};
  return [a.age, a.gender, a.careLevel, a.household]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join("・");
}

/**
 * 探す言葉と表の文字をそろえる。全角と半角（「Ａ」と「A」・「８５」と「85」・全角の空白）、
 * 大文字と小文字の違いで見つからない、を無くす（Unicode の NFKC 正規化＋小文字化）。
 */
function normalizeForSearch(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 「a様」「ab様」のように、記号に「様」を付けた形。この形の言葉は記号そのものと比べる。 */
const CODE_WITH_SAMA = /^[a-z]+様$/;

/**
 * 上の帯の「記号・属性で探す」の言葉で、利用者を絞り込む（画面の中だけで絞る。サーバーへは問い合わせない）。
 *
 * - 空白で区切った言葉は、全部を含む利用者だけを残す（「要介護2 独居」）。
 * - 「A様」のように記号に「様」を付けた言葉は、その記号の利用者だけにする
 *   （含むかどうかで比べると「A様」で「BA様」も出てしまうため）。
 * - それ以外の言葉は、記号（「A様」）と属性の1行のどこかに含まれれば残す（「A」「85」「独居」）。
 * - 言葉が無ければ、渡した一覧をそのまま返す。
 * 並び順は変えない（一覧 API の新しい順のまま）。
 */
export function filterClients(clients: ClientRecord[], query: string): ClientRecord[] {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return clients;
  return clients.filter((client) => {
    const codeLabel = normalizeForSearch(`${client.code}様`);
    const haystack = `${codeLabel} ${normalizeForSearch(clientAttrLine(client))}`;
    return words.every((word) =>
      CODE_WITH_SAMA.test(word) ? word === codeLabel : haystack.includes(word),
    );
  });
}

/** 登録日の表示（日本時間の「2026/09/01」）。サーバーとブラウザ・どの国の端末でも同じ日付にするため日本時間に固定する。 */
const REGISTERED_DATE = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 利用者の登録日（clients.created_at・ISO 8601）を、表の「登録日」の列の形（日本時間の 2026/09/01）にする。
 * 年をまたいで利用者が並ぶので年も出し、桁をそろえて等幅の書体で縦に読めるようにする。
 * 日付として読めない値には null を返す（画面は何も出さない。でたらめな日付を作らない）。
 */
export function formatRegisteredDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return REGISTERED_DATE.format(date);
}

/**
 * 画面の URL（usePathname の値）から、いま選んでいる利用者の ID を取り出す。
 * `/clients/{id}`（とその下）なら id、`/clients` などそれ以外は null。
 *
 * なぜ URL から決めるか: 選んでいる行の色（--row-selected）と上の帯の道しるべ「利用者 / B様」を、
 * 行を押したとき（＝その利用者の URL を開いたとき）だけ出すため。一覧を開いただけでは誰も選ばない
 * （関係者名簿の実名は、行を押したあとにだけ出す ── 吉本さん決定 2026-09-23）。
 * 利用者の ID は UUID（英数字とハイフン）なので、URL の中の形のまま比べる（% の読み替えは要らない）。
 * 使う所: components/clients/ClientsLayout.tsx。
 */
export function selectedClientIdOf(pathname: string | null): string | null {
  if (!pathname) return null;
  return /^\/clients\/([^/]+)/.exec(pathname)?.[1] ?? null;
}
