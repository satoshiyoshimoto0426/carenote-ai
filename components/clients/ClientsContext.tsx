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
 * 繋がる所: GET /api/clients（app/api/clients/route.ts）・components/clients/ClientsLayout.tsx（Provider を置く）・
 * ClientTable.tsx（表と探す欄）・NewClientForm.tsx（登録）。
 */

/** 一覧を読めなかったとき、どの文の先頭にも出す言葉（吉本さん決定 2026-09-23 と同じ文言）。 */
const LIST_ERROR_HEADLINE = "利用者一覧を読めませんでした";

/** 理由が分からない失敗（通信が切れた・応答が一覧の形でない）のときに出す文。 */
const LIST_ERROR_FALLBACK = `${LIST_ERROR_HEADLINE}。少し待ってから、もう一度お試しください。直らない場合は管理者にご連絡ください。`;

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

/** 読み込みの結果。読めなかったときは、画面にそのまま出せる文を持つ。 */
type ListResult = { ok: true; clients: ClientRecord[] } | { ok: false; message: string };

/**
 * GET /api/clients を読み、「一覧」か「読めなかった」かのどちらかにする（例外は投げない）。
 * 通信の失敗・200 以外・本文が JSON でない（ログイン画面の HTML など）・本文が配列でない、はすべて「読めなかった」。
 * 200 以外でサーバーが error の文を返していれば、見出しの後ろにそのまま付ける（直し方の案内を消さない）。
 */
async function loadClientList(): Promise<ListResult> {
  let res: Response;
  try {
    res = await fetch("/api/clients");
  } catch {
    return { ok: false, message: LIST_ERROR_FALLBACK };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const serverError =
      body !== null && typeof body === "object" && "error" in body
        ? (body as { error: unknown }).error
        : undefined;
    if (typeof serverError !== "string" || serverError.trim() === "") {
      return { ok: false, message: LIST_ERROR_FALLBACK };
    }
    return {
      ok: false,
      message: serverError.startsWith(LIST_ERROR_HEADLINE)
        ? serverError
        : `${LIST_ERROR_HEADLINE}。${serverError}`,
    };
  }
  if (!Array.isArray(body)) return { ok: false, message: LIST_ERROR_FALLBACK };
  return { ok: true, clients: body as ClientRecord[] };
}

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
    const result = await loadClientList();
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
