import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientRecord } from "@/types/client";
import { fetchClientList } from "./listError";

/**
 * 利用者一覧の読み込み状態。「読み込み中」「読めた（0人もありうる）」「読めなかった」を分けて持つ。
 * 0人と「読めなかった」を同じ [] で表すと、画面が失敗を空の一覧に見せてしまう（lib/clients/listError.ts）。
 */
export type ClientListState =
  | { status: "loading"; clients: ClientRecord[]; message: null }
  | { status: "ready"; clients: ClientRecord[]; message: null }
  | { status: "error"; clients: ClientRecord[]; message: string };

/** 読み込みを始めた直後の状態（一覧はまだ空）。 */
const LOADING: ClientListState = { status: "loading", clients: [], message: null };

/**
 * 画面で利用者一覧を読む（ブラウザ専用のフック）。読めなかったときは文を持った error 状態になる。
 *
 * なぜあるか: 一覧を「保存先を選ぶため」に読む画面が2つあり（components/create/SaveTranscriptBar.tsx・
 * app/(dashboard)/rescue/page.tsx の保存パネル）、どちらも失敗を黙って捨てていた（2026-09-23 検収）。
 * 読み方と状態の分け方をここに揃え、画面は status を見て「利用者一覧を読めませんでした」を出す。
 *
 * enabled が false のあいだは読まない（救済モードは結果が出てから読む）。true に変わるたびに読み直す。
 * reload はやり直しのボタン用。古い応答（やり直しの前に出した問い合わせ・画面を離れた後の応答）は捨てる。
 */
export function useClientList(enabled = true): ClientListState & { reload: () => void } {
  const [state, setState] = useState<ClientListState>(LOADING);
  /** いちばん新しい問い合わせの番号。これと違う番号の応答は古いので捨てる */
  const latest = useRef(0);

  const load = useCallback(async () => {
    latest.current += 1;
    const mine = latest.current;
    setState(LOADING);
    const result = await fetchClientList();
    if (mine !== latest.current) return;
    setState(
      result.ok
        ? { status: "ready", clients: result.clients, message: null }
        : { status: "error", clients: [], message: result.message },
    );
  }, []);

  useEffect(() => {
    if (!enabled) return;
    load();
    return () => {
      // 画面を離れた・読まない状態に戻ったら、出したままの問い合わせの応答を捨てる
      latest.current += 1;
    };
  }, [enabled, load]);

  return { ...state, reload: load };
}
