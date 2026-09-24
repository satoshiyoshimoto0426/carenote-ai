"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchClientList } from "@/lib/clients/listError";
import type { ClientRecord } from "@/types/client";

/**
 * 利用者の画面（/clients と /clients/{id}）で、一覧の表・上の帯の「記号・属性で探す」・新しい利用者の登録が
 * 同じ一覧を分け合うための入れ物（React の Context）。
 *
 * なぜ存在するか（2026-09-24 A案 A5・計画 U2 の指摘）:
 *   一覧の表は app/(dashboard)/clients/layout.tsx に置き、利用者を選んでも消えない（読み直さない）。
 *   ところが新しい利用者の登録の欄は右の区画（ページ /clients?new=1）にあり、表とは別の部品になる。
 *   ここで一覧を持てば、登録した利用者を読み直さずに表の先頭へ足せる（addClient）。
 *   上の帯の探す欄も別の場所（components/shell/TopBarSlot で上の帯へ差し込む）にあるので、言葉もここで持つ。
 *
 * 一覧を読めなかったときは「0人」にしない: status を "error" にして、画面に
 * 「利用者一覧を読めませんでした」とサーバーの文を出す（まだ利用者がいません、は出さない ── 計画 U0）。
 * 読み方と文は lib/clients/listError.ts の fetchClientList（文字起こしの保存・救済モードの保存パネルと同じ1つの道。
 * 2026-09-24 に枝 redesign/a-backend を取り込んだとき、ここに持っていた同じ決まりの写しを消して寄せた）。
 * 繋がる所: GET /api/clients（app/api/clients/route.ts）・components/clients/ClientsLayout.tsx（Provider を置く）・
 * ClientTable.tsx（表と探す欄）・NewClientForm.tsx（登録）。
 */

/** 一覧の読み込みの状態。「読み込み中」「読めた（0人もありうる）」「読めなかった」を分けて持つ。 */
export type ClientListStatus = "loading" | "ready" | "error";

/** useClients が返す値。 */
export interface ClientsValue {
  /** 一覧の読み込みの状態。error のとき clients は空で、message に画面へ出す文がある。 */
  status: ClientListStatus;
  /** 読めた一覧（新しい順）。登録した利用者は先頭に足される。 */
  clients: ClientRecord[];
  /** 読めなかったときの文（先頭は必ず「利用者一覧を読めませんでした」）。それ以外は null。 */
  message: string | null;
  /** 上の帯の「記号・属性で探す」に入っている言葉。 */
  query: string;
  /** 探す言葉を変える（空文字で絞り込みをやめる）。 */
  setQuery: (query: string) => void;
  /** 登録した利用者を、読み直さずに一覧の先頭へ足す（同じ ID が既にあれば入れ替える）。 */
  addClient: (client: ClientRecord) => void;
  /** 一覧を読み直す（「一覧をもう一度読む」）。 */
  reload: () => void;
}

const ClientsContext = createContext<ClientsValue | null>(null);

/** 一覧の中身（status と clients と message をいつも揃えて変える）。 */
type ListState = Pick<ClientsValue, "status" | "clients" | "message">;

const LOADING: ListState = { status: "loading", clients: [], message: null };

/**
 * 利用者の画面の一覧を読み、子の部品へ配る。components/clients/ClientsLayout.tsx が表と右の区画をまとめて包む。
 * 開いたときに1回だけ読み、利用者を選び替えても読み直さない（表は layout にあり、消えないため）。
 */
export function ClientsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ListState>(LOADING);
  const [query, setQuery] = useState("");
  /** いちばん新しい問い合わせの番号。これと違う番号の応答は古いので捨てる（読み直しの前の応答・画面を離れた後の応答）。 */
  const latest = useRef(0);

  const reload = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    setList(LOADING);
    const result = await fetchClientList();
    if (mine !== latest.current) return;
    setList(
      result.ok
        ? { status: "ready", clients: result.clients, message: null }
        : { status: "error", clients: [], message: result.message },
    );
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      // 画面を離れたら、出したままの問い合わせの応答を捨てる
      latest.current += 1;
    };
  }, [reload]);

  const addClient = useCallback((client: ClientRecord) => {
    setList((prev) => ({
      ...prev,
      clients: [client, ...prev.clients.filter((c) => c.id !== client.id)],
    }));
  }, []);

  const value = useMemo<ClientsValue>(
    () => ({
      ...list,
      query,
      setQuery,
      addClient,
      reload: () => void reload(),
    }),
    [list, query, addClient, reload],
  );

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

/**
 * 利用者の画面の一覧・探す言葉・登録の口を使う。ClientsProvider の外で呼ぶと例外
 * （一覧が無いのに「0人」に見せないため、黙って空の値を返さない）。
 */
export function useClients(): ClientsValue {
  const value = useContext(ClientsContext);
  if (!value) throw new Error("useClients は ClientsProvider の中で使ってください");
  return value;
}
