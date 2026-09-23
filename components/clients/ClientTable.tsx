"use client";

import Link from "next/link";
import { IconAlert, IconLoader, IconSearch } from "@/components/ui/icons";
import { TextAction } from "@/components/ui/primitives";
import { clientAttrLine, filterClients, formatRegisteredDate } from "@/lib/clients/clientList";
import { useClients } from "./ClientsContext";

/**
 * 利用者の一覧の表（A案「作業台」・アートボード A-clients・2026-09-24 A5）。画面いっぱいの表で、
 * 列は 記号（等幅）・属性・登録日（等幅）。見出しの行 40px・行 52px・行の区切りは 1px の線
 * （見た目は app/globals.css の `.client-table*`）。書類の種類ごとの日付の列は後の段（計画 U5）で足す。
 *
 * なぜこの形か:
 *   - 押せるのは記号のリンク（行の見出しのセル <th scope="row"> の中の <a href="/clients/{id}">）だけ。
 *     行（<tr>）に押す動きを付けない ── キーボードと読み上げで操作でき、撮影の道具
 *     （tools/shoot-run.mjs の openClient は `a[href^="/clients/"]` を記号の文字で探す）と
 *     救済モードの保存後のリンク（/clients/{id}）もそのまま使える。
 *   - 選んでいる行（URL が /clients/{id} のときの行）だけ地を --row-selected にし、リンクに aria-current="page" を付ける。
 *     何を選んでいるかは components/clients/ClientsLayout.tsx が URL から決めて selectedId で渡す（勝手に選ばない）。
 *   - 一覧を読めなかったときは「まだ利用者がいません」を出さない（失敗を空の一覧に見せない ── 計画 U0）。
 *   - 実名は出さない: 一覧の1件（ClientRecord）は氏名を持たず、ここは記号・属性・登録日だけを描く。
 *
 * 一覧・探す言葉は components/clients/ClientsContext.tsx の useClients から読む。
 * テスト: components/clients/ClientTable.test.tsx。
 */
export default function ClientTable({ selectedId }: { selectedId: string | null }) {
  const { status, clients, message, query, setQuery, reload } = useClients();

  if (status === "loading") {
    return (
      <p role="status" className="client-table-note">
        <IconLoader size={15} className="animate-spin" />
        読み込み中…
      </p>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="client-table-note client-table-error">
        <IconAlert size={15} className="client-table-error-icon" />
        <div>
          <p>{message}</p>
          <TextAction onClick={reload}>一覧をもう一度読む</TextAction>
        </div>
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div className="client-table-empty">
        <p className="client-table-empty-title">まだ利用者がいません</p>
        <p>
          右上の「新しい利用者」から登録してください。登録した氏名は暗号化して保存し、画面では{" "}
          <span className="client-table-code-sample">A様</span> のような記号で表示します。
        </p>
      </div>
    );
  }

  const rows = filterClients(clients, query);
  if (rows.length === 0) {
    return (
      <div role="status" className="client-table-note">
        <p>「{query.trim()}」に当てはまる利用者はいません。</p>
        <TextAction onClick={() => setQuery("")}>探す言葉を消す</TextAction>
      </div>
    );
  }

  return (
    <table className="client-table">
      <caption className="sr-only">利用者の一覧</caption>
      <thead>
        <tr>
          <th scope="col">記号</th>
          <th scope="col">属性</th>
          <th scope="col" className="client-cell-end">
            登録日
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((client) => {
          const selected = client.id === selectedId;
          const attrs = clientAttrLine(client);
          return (
            <tr key={client.id} data-selected={selected ? "true" : undefined}>
              <th scope="row">
                <Link
                  href={`/clients/${client.id}`}
                  className="client-code-link"
                  aria-current={selected ? "page" : undefined}
                >
                  {client.code}様
                </Link>
              </th>
              <td className={attrs ? "client-attr" : "client-attr-empty"}>
                {attrs || "（属性未設定）"}
              </td>
              <td className="client-cell-end client-date">
                {formatRegisteredDate(client.createdAt)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * 上の帯の「記号・属性で探す」の欄。入れた言葉で表（ClientTable）を画面の中だけで絞る
 * （サーバーへは問い合わせない。探し方の決まりは lib/clients/clientList.ts の filterClients）。
 * 置き場所は上の帯（components/clients/ClientsLayout.tsx が components/shell/TopBarSlot で差し込む）。
 * 言葉は ClientsContext が持つので、表と別の場所にあっても同じ言葉を見る。
 */
export function ClientSearchField() {
  const { query, setQuery } = useClients();
  return (
    <label className="clients-search">
      <IconSearch size={15} />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="記号・属性で探す"
        aria-label="記号・属性で探す"
      />
    </label>
  );
}
