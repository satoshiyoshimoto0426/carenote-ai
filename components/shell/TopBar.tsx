"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import SharingStatus from "@/components/SharingStatus";
import { useTopBarSlotHost } from "@/components/shell/TopBarSlot";
import { IconHelpCircle } from "@/components/ui/icons";
import { helpAnchorOf, NAV_ITEMS, sectionOf } from "@/lib/nav";

/**
 * 上の帯と本文が重ならないよう、帯（＋注意の帯）の実際の高さを書き込む CSS 変数の名前。
 * app/globals.css の .presend-nav（赤い言葉の「前へ／次へ」の帯）と html の scroll-padding-top
 * （フォーカスした部品・使い方の章の飛び先が帯の裏に隠れないようにする）が読む。
 */
export const SHELL_HEAD_HEIGHT_VAR = "--shell-head-h";

/**
 * すべての画面の上に出る高さ 52px の帯（A案「作業台」）と、その下の注意の帯。
 *
 * なぜ存在するか:
 *   - 名簿の共有状態（components/SharingStatus.tsx）は安全のための表示で、どの画面・どの幅でも
 *     見えていなければならない（独立審査 2026-09-13 critical）。以前は左のメニューとスマホ用の
 *     2か所に置いていて、片方が消える幅があった。この帯は外枠（app/(dashboard)/layout.tsx）にあるので、
 *     ページの側で消すことができない。
 *   - 各画面の「この画面の使い方」（/guide#chN）の置き場所。行き先は lib/nav.ts の helpAnchorOf が決める
 *     （使い方の画面では出さない）。
 *
 * 左側: ページが components/shell/TopBarSlot で差し込んだ中身。何も無ければ、いまいる項目の名前
 *   （lib/nav.ts の sectionOf と NAV_ITEMS）を出す（見出しではない ── 各ページがまだ自分の見出しを持つため）。
 * 右側: 「この画面の使い方」と共有状態（点・言葉・事業所の切り替え）。
 * 下: 共有していないときだけ出る注意の帯（SharingStatus variant "strip"）。
 *
 * 帯はスクロールしても上に貼りつく。帯と注意の帯を合わせた高さは、注意の帯の有無や
 * スマホでの折り返しで変わるので、ResizeObserver で測って SHELL_HEAD_HEIGHT_VAR に書く。
 * 固定の数字（旧 72/76/80px）で逃がすと、注意の帯が出ている時だけ「前へ／次へ」が帯の裏に潜る
 * （2026-09-17 critical と同じ種類の不具合）。
 * テスト: components/shell/TopBar.test.tsx・components/shell/TopBarSlot.live.test.tsx。
 */
export default function TopBar() {
  const pathname = usePathname();
  const mode = useSearchParams().get("mode");
  const section = sectionOf(pathname);
  const sectionLabel = NAV_ITEMS.find((item) => item.section === section)?.label ?? null;
  const helpAnchor = helpAnchorOf(pathname, mode);
  const { setSlotEl, filled } = useTopBarSlotHost();
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const head = headRef.current;
    if (!head) return;
    const root = document.documentElement;
    const write = () => {
      const height = head.getBoundingClientRect().height;
      // 測れない環境（高さ 0）では書かない。CSS 側の既定値（--topbar-h）が使われる
      if (height > 0) root.style.setProperty(SHELL_HEAD_HEIGHT_VAR, `${Math.ceil(height)}px`);
    };
    write();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(write);
    observer.observe(head);
    return () => {
      observer.disconnect();
      root.style.removeProperty(SHELL_HEAD_HEIGHT_VAR);
    };
  }, []);

  return (
    <div ref={headRef} className="shell-head">
      <header className="topbar">
        <div className="topbar-left">
          <div ref={setSlotEl} className="topbar-slot" />
          {filled === 0 && sectionLabel ? (
            <span className="topbar-section">{sectionLabel}</span>
          ) : null}
        </div>
        <div className="topbar-right">
          {helpAnchor ? (
            <Link href={`/guide#${helpAnchor}`} className="topbar-help">
              <IconHelpCircle size={16} />
              <span className="topbar-help-text">この画面の使い方</span>
            </Link>
          ) : null}
          <SharingStatus variant="bar" />
        </div>
      </header>
      <SharingStatus variant="strip" />
    </div>
  );
}
