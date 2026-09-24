"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * 上の帯（components/shell/TopBar.tsx）の左側に、ページが自分の見出しを差し込む仕組み。
 *
 * なぜ存在するか:
 *   A案「作業台」では、上の帯の左側がページごとに違う（利用者 = 見出し＋件数＋探す欄、
 *   つくる = 「利用者 / B様 / 担当者会議（第4表）」の道しるべ）。帯は app/(dashboard)/layout.tsx の
 *   外枠にあり、ページの状態（選んだ利用者・書類の種類）を知らない。そこで帯の左に空の差し込み口
 *   （DOM の要素）を置き、ページはこの TopBarSlot で包んだ中身を createPortal でそこへ描く。
 *   ページが何も差し込まないときは、帯は「いまいる項目の名前」を出す（帯が空にならない）。
 *
 * 部品の分担:
 *   - TopBarSlotProvider: 外枠（layout.tsx）が上の帯と本文をまとめて包む。差し込み口の要素と、
 *     いま差し込んでいるページの数を持つ。
 *   - useTopBarSlotHost: 上の帯が使う。差し込み口の要素を登録し、差し込みの有無を知る。
 *   - TopBarSlot（既定の書き出し）: ページが使う。中身を差し込み口へ描く。
 *
 * 差し込みは画面に描かれた後（差し込み口の要素ができた後）に始まるので、サーバーで描いた HTML には
 * ページの見出しが入らず、項目の名前が一瞬出てから入れ替わる。
 * テスト: components/shell/TopBarSlot.live.test.tsx（差し込み・名前の出し分け・外したときに戻ること）。
 */

/** 差し込み口の共有情報。Provider の外で使ったときの値が既定値（差し込み口なし・差し込み0件）。 */
interface SlotState {
  /** 上の帯の左側にある差し込み口の要素。まだ描かれていなければ null。 */
  el: HTMLElement | null;
  /** 上の帯が差し込み口の要素を登録する（ref のコールバックとして渡す）。 */
  setEl: (el: HTMLElement | null) => void;
  /** いま差し込んでいる TopBarSlot の数。0 なら帯は項目の名前を出す。 */
  filled: number;
  /** TopBarSlot が表示中であることを知らせる。返り値を呼ぶと取り消す。 */
  register: () => () => void;
}

const SlotContext = createContext<SlotState>({
  el: null,
  setEl: () => {},
  filled: 0,
  register: () => () => {},
});

/**
 * 上の帯と本文をまとめて包み、差し込み口を共有する。
 * app/(dashboard)/layout.tsx が使う（上の帯とページが兄弟なので、共通の親で持つ必要がある）。
 */
export function TopBarSlotProvider({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [filled, setFilled] = useState(0);
  const register = useCallback(() => {
    setFilled((n) => n + 1);
    return () => setFilled((n) => n - 1);
  }, []);
  const value = useMemo(() => ({ el, setEl, filled, register }), [el, filled, register]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

/**
 * 上の帯（TopBar）が使う。差し込み口の要素を登録する関数（ref に渡す）と、
 * ページが何か差し込んでいるか（filled > 0）を返す。
 */
export function useTopBarSlotHost(): {
  setSlotEl: (el: HTMLElement | null) => void;
  filled: number;
} {
  const { setEl, filled } = useContext(SlotContext);
  return { setSlotEl: setEl, filled };
}

/**
 * ページが上の帯の左側に出したい中身（見出し・道しるべ・探す欄など）を包む。
 * 包んだ中身は本文の位置ではなく上の帯に描かれる。外すと帯は項目の名前に戻る。
 */
export default function TopBarSlot({ children }: { children: ReactNode }) {
  const { el, register } = useContext(SlotContext);
  useEffect(() => register(), [register]);
  if (!el) return null;
  return createPortal(children, el);
}
