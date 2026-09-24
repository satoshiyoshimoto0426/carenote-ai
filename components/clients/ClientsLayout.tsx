"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import TopBarSlot from "@/components/shell/TopBarSlot";
import { IconPlus } from "@/components/ui/icons";
import { btnSecondary, Pane } from "@/components/ui/primitives";
import { selectedClientIdOf } from "@/lib/clients/clientList";
import { ClientsProvider, useClients } from "./ClientsContext";
import ClientTable, { ClientSearchField } from "./ClientTable";

/**
 * 利用者の画面の作業台（A案「作業台」・アートボード A-clients・2026-09-24 A5 ＝ 計画 U1＋U2）。
 * app/(dashboard)/clients/layout.tsx が /clients と /clients/{id} の両方をこれで包む。
 *
 *   上の帯（差し込み）: 見出し「利用者」と人数（/clients）か、道しるべ「利用者 / B様」（/clients/{id}）
 *                        ＋「記号・属性で探す」＋「新しい利用者」（/clients?new=1 を開く脇のボタン）
 *   本文: [左 = 一覧の表（画面いっぱい）] | 1px の線 | [右 = 幅 440px の区画 = ページの中身 children]
 *
 * なぜ layout に置くか: 利用者を選び替えても（/clients/{id} を開いても）表は消えず、読み直さない。
 * 右の区画の中身だけがページ（/clients ＝案内か登録の欄、/clients/{id} ＝その方の詳細）で入れ替わる。
 *
 * 何を選んでいるかは URL だけで決める（usePathname → lib/clients/clientList.ts の selectedClientIdOf）。
 * **一覧を開いただけでは誰も選ばない**: 右の区画には関係者名簿（家族などの実名）が出るので、
 * 行を押した（その方の URL を開いた）ときだけ出す（吉本さん決定 2026-09-23 ──
 * 肩越しに見られる場面で、ホームを開いただけで実名が出ないように）。
 * ?new=1 は useSearchParams で読み、「新しい利用者」を押している状態（aria-current）と右の区画の名前に使う。
 * ?doc= も同じく useSearchParams で読み、選んだ方の書類を開いているあいだは右の区画を 640px に広げる（A6）。
 *
 * 繋がる所: components/clients/ClientsContext.tsx（一覧・探す言葉・登録した利用者を足す口）・
 * ClientTable.tsx（表と探す欄）・NewClientForm.tsx（登録の欄）・components/shell/TopBarSlot.tsx（上の帯への差し込み）・
 * components/ui/primitives.tsx の Pane（区画）。見た目は app/globals.css の `.clients-*`・`.client-table*`。
 * テスト: components/clients/ClientsLayout.test.tsx（選んだ行が URL に付いてくる・勝手に選ばない・登録した利用者が表に出る）。
 */
export default function ClientsLayout({ children }: { children: ReactNode }) {
  return (
    <ClientsProvider>
      <ClientsWorkbench>{children}</ClientsWorkbench>
    </ClientsProvider>
  );
}

/** 作業台の中身（ClientsProvider の中で一覧を読むため、ClientsLayout から分けた）。 */
function ClientsWorkbench({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { clients } = useClients();
  const selectedId = selectedClientIdOf(pathname);
  // 登録の欄を出すのは /clients?new=1 だけ（app/(dashboard)/clients/page.tsx と同じ決まり）
  const isNew = selectedId === null && searchParams.get("new") === "1";
  // 選んだ方の書類を開いている（/clients/{id}?doc=…）あいだは、右の区画を 640px に広げる。書類の中身（表や長い文）は
  // 440px では窮屈なため（A6 ＝ 計画 U3b。中身は components/clients/ClientPane.tsx の OpenedDocument）
  const docOpen = selectedId !== null && Boolean(searchParams.get("doc"));
  const selectedCode = selectedId ? (clients.find((c) => c.id === selectedId)?.code ?? null) : null;
  // 何も選んでいない・登録の欄も開いていない＝右の区画は案内だけ。スマホでは表の下に「左の一覧から…」が出て
  // 向きが合わないので隠す（スマホ用の形は計画 M1 で作る）
  const idle = selectedId === null && !isNew;
  const paneLabel = selectedCode ? `${selectedCode}様` : isNew ? "新しい利用者" : "利用者の詳細";

  return (
    <>
      {/*
        スマホ（768px 未満）の上の帯は、右に「この画面の使い方」と共有状態（安全のため必ず出す）があって狭い。
        2026-09-24 本番で探す欄が潰れて空の箱に見えたため、スマホでは探す欄を出さず見出し「利用者」を見せる
        （探す欄は ClientTable.tsx の ClientSearchField で max-md:hidden）。人数と道しるべは出さない
        （一覧へ戻るのは下のタブの「利用者」）。スマホで探せる形は計画 M1 で作る。
      */}
      <TopBarSlot>
        {selectedId === null ? (
          <ClientsHeading />
        ) : (
          <nav aria-label="現在地" className="clients-crumbs max-md:hidden">
            <Link href="/clients">利用者</Link>
            {selectedCode ? (
              <>
                <span aria-hidden="true" className="clients-crumbs-sep">
                  /
                </span>
                <span className="clients-crumbs-here" aria-current="page">
                  {selectedCode}様
                </span>
              </>
            ) : null}
          </nav>
        )}
        <ClientSearchField />
        <Link
          href="/clients?new=1"
          // 登録の欄を開いているあいだは押した色。btnSecondary の白い地（Tailwind の bg-…）に勝つよう、同じ Tailwind の
          // aria の条件つきの指定で書く（globals.css の層 components に書くと、層 utilities の白い地に負けて効かない）
          className={`${btnSecondary} clients-new aria-[current=page]:bg-[var(--active)]`}
          aria-current={isNew ? "page" : undefined}
        >
          <IconPlus size={14} />
          <span className="max-md:sr-only">新しい利用者</span>
        </Link>
      </TopBarSlot>
      <div className="panes">
        <Pane label="利用者の一覧">
          <ClientTable selectedId={selectedId} />
        </Pane>
        <Pane
          as="aside"
          width={docOpen ? 640 : 440}
          tinted
          label={paneLabel}
          className={idle ? "max-md:hidden" : undefined}
        >
          {children}
        </Pane>
      </div>
    </>
  );
}

/** 一覧のときの上の帯の見出し「利用者」と人数（読めたときだけ。読めない・読み込み中に 0 と出さない）。 */
function ClientsHeading() {
  const { status, clients } = useClients();
  return (
    <>
      <h1 className="clients-title">利用者</h1>
      {status === "ready" ? (
        <span className="clients-count max-md:hidden">
          {clients.length}
          <span className="sr-only">人</span>
        </span>
      ) : null}
    </>
  );
}
