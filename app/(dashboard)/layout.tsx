import Sidebar from "@/components/Sidebar";
import { IconHome, IconSearch } from "@/components/ui/icons";

/**
 * Dashboard shell (design system v0): paper background, sticky 220px sidebar on
 * md+, white top bar with hairline border on mobile.
 *
 * レイアウトは globals.css の .app-* クラス（素のCSS）で組む。Tailwind の
 * クラス生成に頼らない理由: (dashboard) 配下のスキャン取りこぼしで
 * md:ml-[220px] 等が本番CSSに入らず、サイドバーが本文に重なった（2026-07-09）。
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      {/* Sidebar — hidden on mobile, sticky md+（幅・表示切替は globals.css） */}
      <div className="app-sidebar">
        <Sidebar />
      </div>

      {/* Mobile top bar */}
      <div className="app-topbar">
        <div className="min-w-0">
          <div
            className="text-base leading-tight text-[var(--ink)]"
            style={{ fontFamily: "var(--serif)" }}
          >
            CareNote
          </div>
          <div className="text-[10px] tracking-[0.12em] text-[var(--faint)]">ケア記録支援</div>
        </div>
        <MobileNav />
      </div>

      {/* Main content */}
      <div className="app-main">
        <main className="app-main-inner">{children}</main>
        <footer className="text-center py-4 pb-6">
          <p className="text-xs text-[var(--faint)]">CareNote — Powered by Claude API</p>
        </footer>
      </div>
    </div>
  );
}

// Minimal mobile bottom nav
function MobileNav() {
  return (
    <nav className="flex gap-1">
      <a
        href="/dashboard"
        aria-label="ダッシュボード"
        className="flex items-center justify-center rounded-[9px] p-2 text-[var(--muted)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
      >
        <IconHome size={18} />
      </a>
      <a
        href="/evaluate"
        aria-label="評価する"
        className="flex items-center justify-center rounded-[9px] p-2 text-[var(--muted)] hover:bg-[var(--green-soft)] hover:text-[var(--green)]"
      >
        <IconSearch size={18} />
      </a>
    </nav>
  );
}
