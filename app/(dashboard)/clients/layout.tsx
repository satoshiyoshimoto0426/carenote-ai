import type { ReactNode } from "react";
import ClientsLayout from "@/components/clients/ClientsLayout";

/**
 * 利用者の画面（/clients と /clients/{id}）の共通の枠（A案「作業台」・2026-09-24 A5 ＝ 計画 U2）。
 *
 * 左に一覧の表、右に幅 440px の区画を置き、右の区画の中身だけをページ（children）が入れ替える。
 * layout は利用者を選び替えても作り直されないので、表は消えず一覧も読み直さない。
 * 中身は components/clients/ClientsLayout.tsx（URL と ?new=1 を読むのでブラウザ側の部品）。
 * layout 自身は searchParams を受け取れない（Next.js の決まり）ため、読むのはその部品の useSearchParams。
 */
export default function ClientsSectionLayout({ children }: { children: ReactNode }) {
  return <ClientsLayout>{children}</ClientsLayout>;
}
