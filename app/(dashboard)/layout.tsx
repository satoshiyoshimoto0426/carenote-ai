import Rail from "@/components/shell/Rail";
import TopBar from "@/components/shell/TopBar";
import { TopBarSlotProvider } from "@/components/shell/TopBarSlot";

/**
 * ログイン後の全画面の外枠（A案「作業台」・2026-09-23）。
 *
 * 並び: 左の縦の帯（Rail・72px。スマホでは画面の下のタブ）の横に、縦の列
 *   [上の帯（TopBar・52px）＋共有していないときの注意の帯 → 本文 main → AI の送り先の表示] を置く。
 *   列は flex の縦並びで、本文は flex:1・min-height:0（高さを calc(100dvh - …) で決めない ──
 *   注意の帯は出たり消えたり折り返したりするので、固定の数字で引くと下の端が画面の外へ押し出される）。
 *
 * なぜこの形か:
 *   - 名簿の共有状態（安全のための表示）を、ページではなく外枠の上の帯に置く。ページが消すことはできず、
 *     どの幅でも同じ場所（右上）に出る。以前は左メニューとスマホ用の2か所に分かれていた。
 *   - スマホで4項目すべて（利用者・つくる・点検・使い方）へ行ける（以前は3つのアイコンだけ）。
 *   - 「CareNote — Powered by Claude API」は、送り先の AI の会社が画面に出ている唯一の場所なので、
 *     送る帯に「送信先」の表示が入るまで（吉本さんの決定待ち）本文の終わりに残す。
 *
 * レイアウトは globals.css の素の CSS（.app-shell / .app-column / .rail* / .topbar* など）で組む。
 * Tailwind のクラス生成に頼らない理由: (dashboard) 配下のスキャン取りこぼしで
 * md:ml-[220px] 等が本番CSSに入らず、メニューが本文に重なった（2026-07-09）。
 * テスト: app/(dashboard)/layout.test.tsx（帯・共有状態・4項目・送り先の表示が外枠に入っていること）。
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <Rail />
      <TopBarSlotProvider>
        <div className="app-column">
          <TopBar />
          <main className="app-main-inner">{children}</main>
          <footer className="app-footer">
            <p className="text-xs text-[var(--faint)]">CareNote — Powered by Claude API</p>
          </footer>
        </div>
      </TopBarSlotProvider>
    </div>
  );
}
