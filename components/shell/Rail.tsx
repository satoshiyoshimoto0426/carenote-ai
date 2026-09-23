"use client";

import { UserButton, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCheckCircle,
  IconHelpCircle,
  IconPencil,
  IconPeople,
  type IconProps,
} from "@/components/ui/icons";
import { NAV_ITEMS, type NavSection, sectionOf } from "@/lib/nav";

/** ナビの項目とアイコンの対応（components/ui/icons.tsx の冒頭の注釈と同じ）。 */
const ICONS: Record<NavSection, (props: IconProps) => React.JSX.Element> = {
  clients: IconPeople,
  create: IconPencil,
  check: IconCheckCircle,
  guide: IconHelpCircle,
};

/**
 * メールアドレスの「@」より前（画面に出す短い名前）。無ければ空文字。
 * なぜ: 72px の帯には氏名もメールも入らないが、録画や共用の端末で「誰でログインしているか」は
 * 目で確かめられる必要がある（docs/MANUAL-VIDEO-SPEC.md の撮影前の確認）。
 */
export function emailLocalPart(email: string | null | undefined): string {
  if (!email) return "";
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

/**
 * 画面の左の縦の帯（幅 72px・A案「作業台」）。スマホ（768px 未満）では同じ4項目が画面の下のタブになる。
 *
 * なぜ存在するか:
 *   2026-09-23 の吉本さんの決定で、ナビは6項目から4項目（利用者／つくる／点検／使い方）になった。
 *   以前の左メニュー（components/Sidebar.tsx）はスマホで消え、スマホには「ダッシュボード・評価する・使い方」の
 *   3つのアイコンしか無かった（利用者とつくるへスマホから行けなかった）。同じ部品を幅で並べ替えるので、
 *   どの幅でも4項目すべてへ行ける。
 *
 * どれが光るか: lib/nav.ts の sectionOf（古い URL も振り分ける: /rescue → つくる、/dashboard → 点検）。
 *   光っている項目には aria-current="page" を付け、アイコンを緑・線 1.8 で描く。
 * 下端（PC の幅だけ）: Clerk の UserButton（押すとアカウントのメニュー）と、その下にメールの「@」より前を
 *   **文字で**出す（読み上げ用に「ログイン中:」を添える）。スマホの下のタブには入れない（以前のスマホ画面と同じ）。
 * 並び方・大きさは app/globals.css の .rail* クラス（Tailwind の生成に頼らない ── 2026-07-09 の取りこぼし対策）。
 * テスト: components/shell/Rail.test.tsx。
 */
export default function Rail() {
  const pathname = usePathname();
  const current = sectionOf(pathname);
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress;
  const shortId = emailLocalPart(email);

  return (
    <nav aria-label="メイン" className="rail">
      <div className="rail-mark">
        <span aria-hidden="true">CN</span>
        <span className="sr-only">CareNote</span>
      </div>
      <div className="rail-items">
        {NAV_ITEMS.map(({ section, label, href }) => {
          const active = section === current;
          const Icon = ICONS[section];
          return (
            <Link
              key={section}
              href={href}
              className="rail-item"
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} strokeWidth={active ? 1.8 : 1.6} className="rail-icon" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="rail-user">
        <UserButton appearance={{ elements: { avatarBox: "w-8 h-8" } }} />
        {shortId ? (
          <span className="rail-user-id" title={email}>
            <span className="sr-only">ログイン中: </span>
            {shortId}
          </span>
        ) : null}
      </div>
    </nav>
  );
}
